import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { TelemetryStore } from '@domains/telemetry';
import { parseCleared, parseCodes, parseLamp } from '../domain/fault-codes';

export type DiagnosticsState =
  'idle' | 'reading' | 'clearing' | 'failed' | 'clear_failed' | 'not_connected' | 'moving';

/** The lamp is looked at again after this long. */
const LAMP_CHECK_MS = 300_000;
const FIRST_CHECK_MS = 8000;

/** Fault codes of the car. */
@Injectable({ providedIn: 'root' })
export class DiagnosticsStore {
  private readonly telemetry = inject(TelemetryStore);
  private readonly _lamp = signal<boolean | null>(null);
  private readonly _codes = signal<readonly string[]>([]);
  private readonly _readAt = signal<number | null>(null);
  private readonly _state = signal<DiagnosticsState>('idle');

  /** engine warning lamp */
  readonly lamp = this._lamp.asReadonly();
  readonly codes = this._codes.asReadonly();
  /** null = not read yet */
  readonly readAt = this._readAt.asReadonly();
  readonly state = this._state.asReadonly();

  constructor() {
    effect((onCleanup) => {
      const mode = this.telemetry.mode();
      if (mode !== 'obd' && mode !== 'demo') return;
      // Another car or another drive: what was known no longer counts.
      untracked(() => this.reset());
      const check = () => void this.checkLamp();
      const first = setTimeout(check, FIRST_CHECK_MS);
      const timer = setInterval(check, LAMP_CHECK_MS);
      onCleanup(() => {
        clearTimeout(first);
        clearInterval(timer);
      });
    });
  }

  async read(): Promise<void> {
    if (!this.connected()) return this._state.set('not_connected');
    this._state.set('reading');
    try {
      await this.checkLamp();
      const codes = parseCodes(await this.telemetry.request('03'));
      if (!codes) return this._state.set('failed');
      this._codes.set(codes);
      this._readAt.set(Date.now());
      this._state.set('idle');
    } catch {
      this._state.set('failed');
    }
  }

  /** Clears the codes; only while standing and after the user confirmed it. */
  async clear(): Promise<void> {
    if (!this.connected()) return this._state.set('not_connected');
    if (this.telemetry.snapshot().speed > 0) return this._state.set('moving');
    this._state.set('clearing');
    try {
      if (!parseCleared(await this.telemetry.request('04'))) {
        return this._state.set('clear_failed');
      }
      await this.read();
    } catch {
      this._state.set('clear_failed');
    }
  }

  private connected(): boolean {
    const mode = this.telemetry.mode();
    return mode === 'obd' || mode === 'demo';
  }

  private async checkLamp(): Promise<void> {
    try {
      const lamp = parseLamp(await this.telemetry.request('0101', 5000));
      if (lamp !== null) this._lamp.set(lamp);
    } catch {
      // The link dropped; the next connection asks again.
    }
  }

  private reset(): void {
    this._lamp.set(null);
    this._codes.set([]);
    this._readAt.set(null);
    this._state.set('idle');
  }
}
