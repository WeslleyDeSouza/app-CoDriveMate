import { Injectable, Signal, inject, signal } from '@angular/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { CloudVoice } from './cloud-voice';

/**
 * Who speaks. Navigation prompts and warnings ('nav') interrupt everything else;
 * the conversation mode ('talk') is interrupted by everything else.
 */
export type SpeechKind = 'nav' | 'answer' | 'talk';

const PRIORITY: Record<SpeechKind, number> = { nav: 2, answer: 1, talk: 0 };

/** Port: spoken output. */
export abstract class SpeechOutput {
  /** True while anything is spoken or waiting. */
  abstract readonly busy: Signal<boolean>;
  /** Resolves when the text was spoken or dropped; true if it was spoken to its end. */
  abstract speak(text: string, lang: string, rate: number, kind?: SpeechKind): Promise<boolean>;
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

/** Order of utterances by priority; same kinds follow each other. */
export class SpeechQueue {
  private readonly _busy = signal(false);
  private current?: Utterance;
  private waiting: Utterance[] = [];

  readonly busy = this._busy.asReadonly();

  constructor(private readonly voice: Voice) {}

  speak(text: string, lang: string, rate: number, kind: SpeechKind): Promise<boolean> {
    return new Promise((done) => {
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
    await this.voice.silence().catch(() => undefined);
    if (!this.current) await this.next();
  }

  private async next(): Promise<void> {
    const utterance = this.waiting.shift();
    this._busy.set(!!utterance);
    if (!utterance) return;
    this.current = utterance;
    let spoken = true;
    try {
      await this.voice.say(utterance.text, utterance.lang, utterance.rate);
    } catch (error) {
      spoken = false;
      console.warn('Speech output failed', error);
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
      if (this.cloud.available) {
        try {
          return await this.cloud.say(text, lang, rate);
        } catch (error) {
          console.warn('Cloud voice failed, the device speaks', error);
          if (run !== this.stopped) return;
        }
      }
      await TextToSpeech.speak({ text, lang, rate, category: 'playback' });
    },
    silence: async () => {
      this.stopped++;
      await Promise.all([this.cloud.silence(), TextToSpeech.stop().catch(() => undefined)]);
    },
  });
  readonly busy = this.queue.busy;

  speak(text: string, lang: string, rate: number, kind: SpeechKind = 'nav'): Promise<boolean> {
    return this.queue.speak(text, lang, rate, kind);
  }

  stop(kind?: SpeechKind): Promise<void> {
    return this.queue.stop(kind);
  }
}
