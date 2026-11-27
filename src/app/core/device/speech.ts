import { Injectable, Signal, inject, signal } from '@angular/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { CloudVoice } from './cloud-voice';
import { VOICE_LOCALES, bestVoice } from './device-voice';
import { nativeVoice } from './native-voice';

/**
 * Who speaks. Turn-by-turn prompts ('route'), warnings and notices ('nav') interrupt
 * everything else; the conversation mode ('talk') is interrupted by everything else.
 * With the conversation first, a turn prompt is left out while the conversation speaks.
 */
export type SpeechKind = 'route' | 'nav' | 'answer' | 'talk';

const PRIORITY: Record<SpeechKind, number> = { route: 2, nav: 2, answer: 1, talk: 0 };

/** Port: spoken output. */
export abstract class SpeechOutput {
  /** True while anything is spoken or waiting. */
  abstract readonly busy: Signal<boolean>;
  /** Resolves when the text was spoken or dropped; true if it was spoken to its end. */
  abstract speak(text: string, lang: string, rate: number, kind?: SpeechKind): Promise<boolean>;
  /** Texts that will be spoken soon, nearest first; replaces those named before. */
  prepare(texts: readonly string[], lang: string, rate: number): void {
    void [texts, lang, rate];
  }
  /** The driver knows the way: turn prompts do not interrupt the conversation. */
  setTalkFirst(on: boolean): void {
    void on;
  }
  /** Stops everything, or only one kind. */
  abstract stop(kind?: SpeechKind): Promise<void>;
}

/** The part that makes sound. */
export interface Voice {
  say(text: string, lang: string, rate: number): Promise<void>;
  silence(): Promise<void>;
}

interface Utterance {
  readonly text: string;
  readonly lang: string;
  readonly rate: number;
  readonly kind: SpeechKind;
  readonly done: (spoken: boolean) => void;
}

/** Time to fetch the sound, longer for stories. */
const START_LIMIT_MS = 12_000;
const LONG_START_LIMIT_MS = 35_000;
const LONG_TEXT = 160;
/** Slower than any voice speaks. */
const LIMIT_PER_CHAR_MS = 150;
const SILENCE_LIMIT_MS = 2000;

/** After this time an utterance counts as stuck: it must not silence all later ones. */
function limitMs({ text, rate }: Utterance): number {
  const start = text.length > LONG_TEXT ? LONG_START_LIMIT_MS : START_LIMIT_MS;
  return start + (text.length * LIMIT_PER_CHAR_MS) / Math.min(1, rate || 1);
}

class StuckError extends Error {}

function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StuckError('Speech output is stuck')), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/** Order of utterances by priority; same kinds follow each other. */
export class SpeechQueue {
  private readonly _busy = signal(false);
  private current?: Utterance;
  private waiting: Utterance[] = [];

  readonly busy = this._busy.asReadonly();
  /** Turn prompts are left out while the conversation speaks. */
  talkFirst = false;

  constructor(private readonly voice: Voice) {}

  speak(text: string, lang: string, rate: number, kind: SpeechKind): Promise<boolean> {
    return new Promise((done) => {
      if (kind === 'route' && this.talkFirst && this.current?.kind === 'talk') return done(false);
      const lower = (other: Utterance) => PRIORITY[other.kind] < PRIORITY[kind];
      this.drop(lower);
      this.waiting.push({ text, lang, rate, kind, done });
      this.waiting.sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind]);
      this._busy.set(true);
      if (!this.current) void this.next();
      else if (lower(this.current)) void this.cut();
    });
  }

  async stop(kind?: SpeechKind): Promise<void> {
    const match = (other: Utterance) => !kind || other.kind === kind;
    this.drop(match);
    if (this.current && match(this.current)) await this.cut();
  }

  private drop(match: (utterance: Utterance) => boolean): void {
    const dropped = this.waiting.filter(match);
    this.waiting = this.waiting.filter((utterance) => !match(utterance));
    dropped.forEach(({ done }) => done(false));
  }

  /** A stopped utterance may never report its end, so it is left behind. */
  private async cut(): Promise<void> {
    const cut = this.current;
    this.current = undefined;
    cut?.done(false);
    await this.hush();
    if (!this.current) await this.next();
  }

  private async hush(): Promise<void> {
    await within(this.voice.silence(), SILENCE_LIMIT_MS).catch(() => undefined);
  }

  private async next(): Promise<void> {
    const utterance = this.waiting.shift();
    this._busy.set(!!utterance);
    if (!utterance) return;
    this.current = utterance;
    let spoken = true;
    try {
      const { text, lang, rate } = utterance;
      await within(this.voice.say(text, lang, rate), limitMs(utterance));
    } catch (error) {
      spoken = false;
      console.warn('Speech output failed', error);
      if (error instanceof StuckError && this.current === utterance) await this.hush();
    }
    if (this.current !== utterance) return;
    this.current = undefined;
    utterance.done(spoken);
    // The caller may have queued more in the meantime.
    if (!this.current) await this.next();
  }
}

@Injectable()
export class DeviceSpeechOutput extends SpeechOutput {
  private readonly cloud = inject(CloudVoice);
  private stopped = 0;
  private readonly queue = new SpeechQueue({
    say: async (text, lang, rate) => {
      const run = this.stopped;
      if (this.cloud.available || this.cloud.prepared(text, lang, rate)) {
        try {
          return await this.cloud.say(text, lang, rate);
        } catch (error) {
          console.warn('Cloud voice failed, the device speaks', error);
          if (run !== this.stopped) return;
        }
      }
      const locale = VOICE_LOCALES[lang] ?? lang;
      const native = nativeVoice();
      const voice = native ? await this.iosVoice(locale) : undefined;
      if (run !== this.stopped) return;
      if (native) return native.speak({ text, locale, rate, ...(voice ? { voice } : {}) });
      await TextToSpeech.speak({ text, lang: locale, rate });
    },
    silence: async () => {
      this.stopped++;
      const device = nativeVoice() ?? TextToSpeech;
      await Promise.all([this.cloud.silence(), device.stop().catch(() => undefined)]);
    },
  });
  readonly busy = this.queue.busy;

  speak(text: string, lang: string, rate: number, kind: SpeechKind = 'nav'): Promise<boolean> {
    return this.queue.speak(text, lang, rate, kind);
  }

  override prepare(texts: readonly string[], lang: string, rate: number): void {
    this.cloud.prepare(texts, lang, rate);
  }

  override setTalkFirst(on: boolean): void {
    this.queue.talkFirst = on;
  }

  stop(kind?: SpeechKind): Promise<void> {
    return this.queue.stop(kind);
  }

  /** Asked every time: a voice may have been downloaded. */
  private async iosVoice(locale: string): Promise<string | undefined> {
    try {
      const { voices } = await TextToSpeech.getSupportedVoices();
      return voices[bestVoice(voices, locale)]?.voiceURI;
    } catch {
      return undefined;
    }
  }
}
