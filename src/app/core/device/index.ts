import { Injectable, Provider } from '@angular/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { DeviceSpeechInput, SpeechInput } from './listening';
import { DeviceReminders, Reminders } from './reminders';
import { DeviceSpeechOutput, SpeechOutput } from './speech';

export { ListeningUnavailableError, SpeechInput } from './listening';
export { Reminders } from './reminders';
export type { Reminder } from './reminders';
export { CLOUD_VOICES, CloudVoice } from './cloud-voice';
export { SpeechOutput } from './speech';
export type { SpeechKind } from './speech';

/** Port: keeps the screen on. */
export abstract class WakeLock {
  abstract set(on: boolean): Promise<void>;
}

@Injectable()
export class CapacitorWakeLock extends WakeLock {
  async set(on: boolean): Promise<void> {
    try {
      await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep());
    } catch {
      // Not supported here: the screen simply follows the system setting.
    }
  }
}

export function provideDevice(): Provider[] {
  return [
    { provide: SpeechOutput, useClass: DeviceSpeechOutput },
    { provide: SpeechInput, useClass: DeviceSpeechInput },
    { provide: Reminders, useClass: DeviceReminders },
    { provide: WakeLock, useClass: CapacitorWakeLock },
  ];
}
