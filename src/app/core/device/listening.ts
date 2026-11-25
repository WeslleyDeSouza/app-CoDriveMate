import { Injectable } from '@angular/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';
import { nativeVoice } from './native-voice';

/** The user does not allow the microphone, or the device cannot listen. */
export class ListeningUnavailableError extends Error {
  constructor(readonly denied: boolean) {
    super(denied ? 'Microphone not allowed.' : 'Speech input not available.');
    this.name = 'ListeningUnavailableError';
  }
}

/** Port: spoken input, one utterance at a time. */
export abstract class SpeechInput {
  /** What was said, '' if nothing. Rejects with ListeningUnavailableError. */
  abstract listen(lang: string, maxMs: number): Promise<string>;
  abstract abort(): void;
}

const GRACE_MS = 3000;

interface WebRecognition {
  lang: string;
  interimResults: boolean;
  onresult: (event: { results: { transcript: string }[][] }) => void;
  onerror: (event: { error: string }) => void;
  onend: () => void;
  start(): void;
  stop(): void;
  abort(): void;
}

/** Chrome's recognition on the web, the system's in the apps. */
@Injectable()
export class DeviceSpeechInput extends SpeechInput {
  private cancel?: () => void;

  async listen(lang: string, maxMs: number): Promise<string> {
    this.abort();
    return Capacitor.isNativePlatform() ? this.native(lang, maxMs) : this.web(lang, maxMs);
  }

  abort(): void {
    this.cancel?.();
    this.cancel = undefined;
  }

  private web(lang: string, maxMs: number): Promise<string> {
    const scope = globalThis as unknown as Record<string, (new () => WebRecognition) | undefined>;
    const Recognition = scope['SpeechRecognition'] ?? scope['webkitSpeechRecognition'];
    if (!Recognition) return Promise.reject(new ListeningUnavailableError(false));
    return new Promise((resolve, reject) => {
      const recognition = new Recognition();
      let text = '';
      let denied = false;
      const timer = setTimeout(() => recognition.stop(), maxMs);
      recognition.lang = lang;
      recognition.interimResults = false;
      recognition.onresult = (event) => (text = event.results[0]?.[0]?.transcript ?? '');
      recognition.onerror = ({ error }) => (denied = /not-allowed|service-not/.test(error));
      recognition.onend = () => {
        clearTimeout(timer);
        if (denied) reject(new ListeningUnavailableError(true));
        else resolve(text.trim());
      };
      this.cancel = () => recognition.abort();
      recognition.start();
    });
  }

  private async ios(
    voice: NonNullable<ReturnType<typeof nativeVoice>>,
    language: string,
    maxMs: number,
  ): Promise<string> {
    let cancel: () => void = () => undefined;
    const cancelled = new Promise<string>((resolve) => (cancel = () => resolve('')));
    const mine = (this.cancel = () => {
      cancel();
      void voice.stopListening().catch(() => undefined);
    });
    // Whatever happens to the recognition, the caller gets an answer.
    const timer = setTimeout(mine, maxMs + GRACE_MS);
    try {
      const heard = voice.listen({ language, maxMs }).then(({ text }) => text.trim());
      return await Promise.race([heard, cancelled]);
    } catch {
      // Without a connection there is no recognition; the next time may work.
      return '';
    } finally {
      clearTimeout(timer);
      if (this.cancel === mine) this.cancel = undefined;
    }
  }

  private async native(lang: string, maxMs: number): Promise<string> {
    const { available } = await SpeechRecognition.available();
    if (!available) throw new ListeningUnavailableError(false);
    let { speechRecognition } = await SpeechRecognition.checkPermissions();
    if (speechRecognition !== 'granted') {
      ({ speechRecognition } = await SpeechRecognition.requestPermissions());
    }
    if (speechRecognition !== 'granted') throw new ListeningUnavailableError(true);

    const ios = nativeVoice();
    if (ios) return this.ios(ios, lang, maxMs);

    let text = '';
    let end: () => void = () => undefined;
    const ended = new Promise<void>((resolve) => (end = resolve));
    const listeners = await Promise.all([
      SpeechRecognition.addListener('partialResults', ({ matches }) => {
        text = matches?.[0] ?? text;
      }),
      SpeechRecognition.addListener('listeningState', ({ status }) => {
        if (status === 'stopped') end();
      }),
    ]);
    const timer = setTimeout(end, maxMs);
    this.cancel = () => {
      text = '';
      end();
    };
    try {
      await SpeechRecognition.start({ language: lang, partialResults: true, popup: false });
      await ended;
      return text.trim();
    } finally {
      clearTimeout(timer);
      await SpeechRecognition.stop().catch(() => undefined);
      listeners.forEach((listener) => void listener.remove());
    }
  }
}
