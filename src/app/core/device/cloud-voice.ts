import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpPort } from '@core/http';
import { ServiceReset } from '@core/http/service-reset';
import { CacheStore } from '@core/storage';
import { Voice } from './speech';

export const CLOUD_VOICES = ['Aoede', 'Kore', 'Leda', 'Charon', 'Puck', 'Fenrir'] as const;

export interface CloudVoiceSettings {
  /** '' = the voice of the device is used */
  readonly key: string;
  /** one of CLOUD_VOICES */
  readonly voice: string;
}

const URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const BUCKET = 'tts';
const MAX_ENTRIES = 400;
/** Only short sentences come back often enough to be worth keeping. */
const MAX_CACHED_LENGTH = 160;
const LOCALES: Record<string, string> = { de: 'de-DE', en: 'en-GB' };

/** The service does not work with this key; pointless until it changes. */
class VoiceRefusedError extends Error {}

/**
 * Google Cloud Text-to-Speech with the user's own key. Throws when it cannot
 * speak, so that the voice of the device takes over.
 */
@Injectable({ providedIn: 'root' })
export class CloudVoice implements Voice {
  private readonly http = inject(HttpPort);
  private readonly cache = inject(CacheStore);
  private readonly reset = inject(ServiceReset);
  private readonly settings = signal<CloudVoiceSettings>({ key: '', voice: CLOUD_VOICES[0] });
  private readonly _problem = signal<'refused' | 'quota' | null>(null);
  private refusedKey = '';
  private audio?: HTMLAudioElement;
  private finish?: () => void;
  private generation = 0;

  /** Why the cloud voice is not used, null if it is fine. */
  readonly problem = this._problem.asReadonly();

  constructor() {
    effect(() => {
      if (!this.reset.count()) return;
      this.refusedKey = '';
      this._problem.set(null);
    });
  }

  configure(settings: CloudVoiceSettings): void {
    this.settings.set(settings);
    if (settings.key !== this.refusedKey) this._problem.set(null);
  }

  get available(): boolean {
    const { key } = this.settings();
    return !!key && key !== this.refusedKey && globalThis.navigator?.onLine !== false;
  }

  async say(text: string, lang: string, rate: number): Promise<void> {
    const generation = this.generation;
    const blob = await this.synthesize(text, lang, rate);
    // Stopped while the sound was on its way.
    if (generation === this.generation) await this.play(blob);
  }

  async silence(): Promise<void> {
    this.generation++;
    this.audio?.pause();
    this.finish?.();
  }

  private async synthesize(text: string, lang: string, rate: number): Promise<Blob> {
    const { key, voice } = this.settings();
    const languageCode = LOCALES[lang] ?? 'de-DE';
    const name = `${languageCode}-Chirp3-HD-${voice}`;
    const cacheKey = `${name}|${rate}|${text}`;
    const keep = text.length <= MAX_CACHED_LENGTH;
    if (keep) {
      const stored = await this.cache.get<Blob>(BUCKET, cacheKey).catch(() => undefined);
      if (stored) return stored;
    }
    const response = await this.http.fetch(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name },
        audioConfig: { audioEncoding: 'MP3', speakingRate: rate },
      }),
    });
    if (!response.ok) {
      if (response.status === 429) this.refuse(key, 'quota');
      if ([400, 401, 403].includes(response.status)) this.refuse(key, 'refused');
      throw new VoiceRefusedError('Cloud voice: HTTP ' + response.status);
    }
    const { audioContent } = (await response.json()) as { audioContent: string };
    const bytes = Uint8Array.from(atob(audioContent), (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    if (keep) {
      await this.cache.put(BUCKET, cacheKey, blob).catch(() => undefined);
      if (Math.random() < 0.05) void this.cache.prune(BUCKET, MAX_ENTRIES).catch(() => 0);
    }
    return blob;
  }

  private refuse(key: string, problem: 'refused' | 'quota'): void {
    this.refusedKey = key;
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
      audio.onended = this.finish;
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
