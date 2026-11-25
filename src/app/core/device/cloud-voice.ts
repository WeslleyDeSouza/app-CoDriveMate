import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpPort } from '@core/http';
import { ServiceReset } from '@core/http/service-reset';
import { CacheStore } from '@core/storage';
import {
  CLOUD_VOICES,
  CloudVoiceProvider,
  VOICE_SERVICES,
  googleVoice,
  voiceProblem,
} from './cloud-voice-services';
import { nativeVoice } from './native-voice';
import { RealtimeRefusedError, RealtimeVoice } from './realtime-voice';
import { Voice } from './speech';

export interface CloudVoiceSettings {
  readonly provider: CloudVoiceProvider;
  /** '' = the voice of the device is used */
  readonly key: string;
  /** name or ID of the voice at the provider */
  readonly voice: string;
}

/** A voice in the account of the user. */
export interface AccountVoice {
  readonly id: string;
  readonly name: string;
  /** codes such as 'de' */
  readonly languages: readonly string[];
}

interface ElevenVoice {
  voice_id: string;
  name: string;
  labels?: Record<string, string> | null;
  verified_languages?: { language?: string }[] | null;
}

const BUCKET = 'tts';
const MAX_ENTRIES = 400;
/** Only short sentences come back often enough to be worth keeping. */
const MAX_CACHED_LENGTH = 160;
/** A prompt that comes too late is useless: then the device speaks. */
const TIMEOUT_MS = 6000;
/** Stories are long and nothing depends on their moment. */
const LONG_TIMEOUT_MS = 25_000;

interface Prepared {
  readonly id: string;
  readonly text: string;
  readonly lang: string;
  readonly rate: number;
}

/** After a failure, sentences are not fetched ahead for this long. */
const PREPARE_PAUSE_MS = 30_000;

/** The service does not work with this key; pointless until it changes. */
class VoiceRefusedError extends Error {}

/**
 * Natural voice of Google, OpenAI or ElevenLabs with the user's own key. Throws
 * when it cannot speak, so that the voice of the device takes over.
 */
@Injectable({ providedIn: 'root' })
export class CloudVoice implements Voice {
  private readonly http = inject(HttpPort);
  private readonly cache = inject(CacheStore);
  private readonly reset = inject(ServiceReset);
  private readonly realtime = inject(RealtimeVoice);
  private readonly settings = signal<CloudVoiceSettings>({
    provider: 'google',
    key: '',
    voice: CLOUD_VOICES[0],
  });
  private readonly _problem = signal<'refused' | 'quota' | null>(null);
  /** What was refused; tried again as soon as anything of it changes. */
  private refused = '';
  private audio?: HTMLAudioElement;
  private finish?: () => void;
  private generation = 0;
  /** Sentences of the route ahead, only in memory: not every provider allows more. */
  private readonly ready = new Map<string, Blob>();
  private readonly pending = new Map<string, Promise<Blob>>();
  private wanted: readonly Prepared[] = [];
  private preparing = false;
  private prepareAgainAt = 0;
  private request?: AbortController;

  /** Why the cloud voice is not used, null if it is fine. */
  readonly problem = this._problem.asReadonly();

  constructor() {
    effect(() => {
      if (!this.reset.count()) return;
      this.retry();
    });
    // A refusal may have come from a hotspot's login page or a lost connection.
    globalThis.addEventListener?.('online', () => this.retry());
  }

  configure(settings: CloudVoiceSettings): void {
    this.settings.set(settings);
    if (identity(settings) !== this.refused) this._problem.set(null);
  }

  get available(): boolean {
    const settings = this.settings();
    return (
      !!settings.key &&
      !!settings.voice &&
      identity(settings) !== this.refused &&
      globalThis.navigator?.onLine !== false
    );
  }

  get provider(): CloudVoiceProvider {
    return this.settings().provider;
  }

  /** Names of the natural Google voices of a language, as in CLOUD_VOICES. */
  async googleVoices(key: string, lang: string): Promise<string[]> {
    const { languageCode, name: prefix } = googleVoice('', lang);
    const response = await this.http.fetch(
      `https://texttospeech.googleapis.com/v1/voices?languageCode=${languageCode}`,
      { headers: { 'x-goog-api-key': key } },
    );
    if (!response.ok) throw new VoiceRefusedError('Voices: HTTP ' + response.status);
    const { voices } = (await response.json()) as { voices?: { name: string }[] };
    return (voices ?? [])
      .filter(({ name }) => name.startsWith(prefix))
      .map(({ name }) => name.slice(prefix.length))
      .sort();
  }

  /** Voices of an ElevenLabs account. */
  async accountVoices(key: string): Promise<AccountVoice[]> {
    const response = await this.http.fetch('https://api.elevenlabs.io/v2/voices?page_size=100', {
      headers: { 'xi-api-key': key },
    });
    if (!response.ok) throw new VoiceRefusedError('Voices: HTTP ' + response.status);
    const { voices } = (await response.json()) as { voices: ElevenVoice[] };
    return voices.map(({ voice_id, name, labels, verified_languages }) => {
      const codes = [labels?.['language'], ...(verified_languages ?? []).map((v) => v.language)];
      const languages = [...new Set(codes.filter((code): code is string => !!code))];
      return { id: voice_id, name, languages };
    });
  }

  async say(text: string, lang: string, rate: number): Promise<void> {
    const generation = this.generation;
    const id = this.idOf(text, lang, rate);
    const fetching = this.pending.get(id);
    const blob =
      this.ready.get(id) ??
      (await (fetching ? inTime(fetching, TIMEOUT_MS) : this.synthesize(text, lang, rate)));
    // Stopped while the sound was on its way.
    if (generation !== this.generation) return;
    const native = nativeVoice();
    if (!native) return this.play(blob);
    const data = encode(new Uint8Array(await blob.arrayBuffer()));
    if (generation === this.generation) await native.play({ data });
  }

  /** Whether a sentence is there, also without a connection. */
  prepared(text: string, lang: string, rate: number): boolean {
    return this.ready.has(this.idOf(text, lang, rate));
  }

  /** Fetches sentences ahead, one after the other; those not named any more are dropped. */
  prepare(texts: readonly string[], lang: string, rate: number): void {
    const ids = new Set<string>();
    this.wanted = texts.flatMap((text) => {
      const id = this.idOf(text, lang, rate);
      if (ids.has(id)) return [];
      ids.add(id);
      return [{ id, text, lang, rate }];
    });
    for (const id of this.ready.keys()) if (!ids.has(id)) this.ready.delete(id);
    void this.fetchAhead();
  }

  private async fetchAhead(): Promise<void> {
    if (this.preparing) return;
    this.preparing = true;
    try {
      while (this.available && Date.now() >= this.prepareAgainAt) {
        const next = this.wanted.find(({ id }) => !this.ready.has(id));
        // Another voice was chosen in the meantime: named anew with the next manoeuvre.
        if (!next || next.id !== this.idOf(next.text, next.lang, next.rate)) return;
        const sound = this.synthesize(next.text, next.lang, next.rate, true);
        this.pending.set(next.id, sound);
        try {
          const blob = await sound;
          if (this.wanted.some(({ id }) => id === next.id)) this.ready.set(next.id, blob);
        } catch {
          this.prepareAgainAt = Date.now() + PREPARE_PAUSE_MS;
          setTimeout(() => void this.fetchAhead(), PREPARE_PAUSE_MS);
        } finally {
          this.pending.delete(next.id);
        }
      }
    } finally {
      this.preparing = false;
    }
  }

  private idOf(text: string, lang: string, rate: number): string {
    return `${identity(this.settings())}|${lang}|${rate}|${text}`;
  }

  async silence(): Promise<void> {
    this.generation++;
    this.request?.abort();
    this.audio?.pause();
    this.finish?.();
  }

  private retry(): void {
    this.refused = '';
    this._problem.set(null);
    this.realtime.forget();
    this.prepareAgainAt = 0;
    void this.fetchAhead();
  }

  /** @param ahead nobody waits for it: a failure must not switch the voice off */
  private async synthesize(text: string, lang: string, rate: number, ahead = false): Promise<Blob> {
    const settings = this.settings();
    const { provider, key, voice } = settings;
    const timeout = text.length <= MAX_CACHED_LENGTH ? TIMEOUT_MS : LONG_TIMEOUT_MS;
    if (provider === 'openai') {
      return this.realtimeSpeech(settings, text, lang, rate, timeout, ahead);
    }
    const service = VOICE_SERVICES[provider];
    const cacheKey = `${googleVoice(voice, lang).name}|${rate}|${text}`;
    const keep = service.cacheable && text.length <= MAX_CACHED_LENGTH;
    if (keep) {
      const stored = await this.cache.get<Blob>(BUCKET, cacheKey).catch(() => undefined);
      if (stored) return stored;
    }
    const { url, init } = service.request({ key, voice, text, lang, rate });
    const response = await inTime(
      service.binary ? this.http.fetchBinary(url, init) : this.http.fetch(url, init),
      timeout,
    );
    if (!response.ok) {
      const problem = voiceProblem(response.status, await response.text().catch(() => ''));
      if (problem && !ahead) this.refuse(settings, problem);
      throw new VoiceRefusedError('Cloud voice: HTTP ' + response.status);
    }
    const bytes = service.binary
      ? await response.arrayBuffer()
      : decode(((await response.json()) as { audioContent: string }).audioContent);
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    if (keep) {
      await this.cache.put(BUCKET, cacheKey, blob).catch(() => undefined);
      if (Math.random() < 0.05) void this.cache.prune(BUCKET, MAX_ENTRIES).catch(() => 0);
    }
    return blob;
  }

  private async realtimeSpeech(
    settings: CloudVoiceSettings,
    text: string,
    lang: string,
    rate: number,
    timeout: number,
    ahead: boolean,
  ): Promise<Blob> {
    const { key, voice } = settings;
    const request = new AbortController();
    // Silence ends what is spoken, not what is fetched ahead.
    if (!ahead) this.request = request;
    try {
      const speech = this.realtime.synthesize({ key, voice, text, lang, rate }, request.signal);
      return await inTime(speech, timeout);
    } catch (error) {
      request.abort();
      if (error instanceof RealtimeRefusedError) {
        const problem = voiceProblem(error.status, error.body);
        if (problem && !ahead) this.refuse(settings, problem);
      }
      throw error;
    }
  }

  private refuse(settings: CloudVoiceSettings, problem: 'refused' | 'quota'): void {
    // The settings may have changed while the request was running.
    if (identity(settings) !== identity(this.settings())) return;
    this.refused = identity(settings);
    this._problem.set(problem);
  }

  private play(blob: Blob): Promise<void> {
    const url = globalThis.URL.createObjectURL(blob);
    const audio = (this.audio = new Audio(url));
    return new Promise<void>((resolve, reject) => {
      const end = () => {
        globalThis.URL.revokeObjectURL(url);
        if (this.audio === audio) this.audio = this.finish = undefined;
      };
      this.finish = () => {
        end();
        resolve();
      };
      // Paused from outside (call, other app): it would never end.
      audio.onended = audio.onpause = this.finish;
      audio.onerror = () => {
        end();
        reject(new Error('Sound could not be played.'));
      };
      audio.play().catch((error: unknown) => {
        end();
        reject(error);
      });
    });
  }
}

function identity({ provider, key, voice }: CloudVoiceSettings): string {
  return `${provider}|${key}|${voice}`;
}

function encode(bytes: Uint8Array): string {
  let text = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(text);
}

function decode(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function inTime<T>(work: Promise<T>, timeout: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Cloud voice: too slow')), timeout);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}
