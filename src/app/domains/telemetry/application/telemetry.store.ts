import { Injectable, InjectionToken, computed, inject, isDevMode, signal } from '@angular/core';
import { AdapterUnknownError, reconnectDelayS } from '../domain/adapter';
import { consumptionPer100Km, fuelRateLph } from '../domain/fuel';
import { estimateGear } from '../domain/gear';
import {
  TelemetryMode,
  TelemetrySnapshot,
  TelemetrySource,
  TelemetryUpdate,
  emptySnapshot,
  isAllowedRequest,
} from '../domain/telemetry';
import { ObdReport, collectObd, isReportRequest } from '../domain/obd-report';
import { VehicleProfile, XSARA_PICASSO } from '../domain/vehicle-profile';
import { AdapterStore } from './adapter.store';

export const OBD_TELEMETRY_SOURCE = new InjectionToken<TelemetrySource>('OBD_TELEMETRY_SOURCE');
/** The demo drive is for development; a production build does not offer it. */
export const DEMO_ENABLED = new InjectionToken<boolean>('DEMO_ENABLED', {
  providedIn: 'root',
  factory: () => isDevMode(),
});
export const DEMO_TELEMETRY_SOURCE = new InjectionToken<TelemetrySource>('DEMO_TELEMETRY_SOURCE');

/** Live vehicle state for the whole app. */
@Injectable({ providedIn: 'root' })
export class TelemetryStore {
  private readonly obd = inject(OBD_TELEMETRY_SOURCE);
  private readonly demo = inject(DEMO_TELEMETRY_SOURCE);
  private readonly adapters = inject(AdapterStore);
  /** Whether the demo drive may be offered. */
  readonly demoEnabled = inject(DEMO_ENABLED);
  private active?: TelemetrySource;
  private retryTimer?: ReturnType<typeof setTimeout>;

  private readonly _snapshot = signal<TelemetrySnapshot>(emptySnapshot());
  private readonly _mode = signal<TelemetryMode>('off');
  private readonly _rateHz = signal<number | null>(null);
  private readonly _error = signal<unknown>(null);
  private readonly _profile = signal<VehicleProfile>(XSARA_PICASSO);

  readonly snapshot = this._snapshot.asReadonly();
  readonly mode = this._mode.asReadonly();
  readonly rateHz = this._rateHz.asReadonly();
  /** The error of the last failed connection attempt. */
  readonly error = this._error.asReadonly();
  readonly profile = this._profile.asReadonly();

  readonly gear = computed(() => {
    const { speed, rpm } = this._snapshot();
    return estimateGear(speed, rpm, this._profile().gearRatios);
  });
  readonly fuelRateLph = computed(() => fuelRateLph(this._snapshot(), this._profile()));
  readonly consumptionPer100Km = computed(() =>
    consumptionPer100Km(this.fuelRateLph(), this._snapshot().speed),
  );

  setProfile(profile: VehicleProfile): void {
    this._profile.set(profile);
  }

  /** Connects the chosen adapter; asks for one the first time. */
  connectObd(): Promise<void> {
    return this.use(this.obd, 'obd', async () => {
      await this.adapters.load();
      if (!this.adapters.settings().adapter) await this.adapters.choose('ble');
    });
  }

  /** Connects at app start, if the user wants that; keeps trying until the car is on. */
  async autoConnect(): Promise<void> {
    await this.adapters.load();
    const { adapter, autoConnect } = this.adapters.settings();
    if (!adapter || !autoConnect || this._mode() !== 'off') return;
    this.active = this.obd;
    this._error.set(null);
    this._mode.set('connecting');
    await this.attempt(this.obd, 0);
  }

  startDemo(): Promise<void> {
    if (!this.demoEnabled) return Promise.resolve();
    return this.use(this.demo, 'demo');
  }

  /** Tests the adapter; a running connection is interrupted and resumed. */
  async testAdapter(): Promise<boolean> {
    const resume = this.active === this.obd;
    if (resume) await this.stop();
    const passed = await this.adapters.test();
    if (resume && this._mode() === 'off') void this.connectObd();
    return passed;
  }

  /** Asks the car for fault codes and the like. Rejects without a connection. */
  async request(command: string, timeoutMs = 10_000): Promise<string> {
    if (!isAllowedRequest(command)) throw new Error('Request not allowed: ' + command);
    const mode = this._mode();
    if (!this.active || (mode !== 'obd' && mode !== 'demo')) throw new Error('Not connected.');
    return this.active.request(command, timeoutMs);
  }

  /** Everything the car and the adapter tell, for finding faults. Rejects without a connection. */
  async report(
    onProgress: (share: number) => void,
    cancelled: () => boolean,
  ): Promise<ObdReport & Record<string, unknown>> {
    const source = this.active;
    const mode = this._mode();
    if (!source || (mode !== 'obd' && mode !== 'demo')) throw new Error('Not connected.');
    const gone = () => cancelled() || this.active !== source || this._mode() !== mode;
    const report = await collectObd(
      (command) => {
        if (!isReportRequest(command)) throw new Error('Request not allowed: ' + command);
        return source.request(command, 5000);
      },
      onProgress,
      gone,
    );
    const { adapter } = this.adapters.settings();
    return {
      source: mode,
      adapter: mode === 'obd' && adapter ? { kind: adapter.kind, name: adapter.name } : null,
      rateHz: this._rateHz(),
      live: this._snapshot(),
      calculated: {
        gear: this.gear(),
        fuelRateLph: this.fuelRateLph(),
        consumptionPer100Km: this.consumptionPer100Km(),
      },
      ...report,
    };
  }

  async stop(): Promise<void> {
    const source = this.active;
    this.active = undefined;
    clearTimeout(this.retryTimer);
    this.reset();
    await source?.stop();
  }

  private async use(
    source: TelemetrySource,
    mode: TelemetryMode,
    prepare?: () => Promise<void>,
  ): Promise<void> {
    await this.stop();
    this._error.set(null);
    this._mode.set('connecting');
    this.active = source;
    try {
      await prepare?.();
      if (this.active !== source) return;
      await this.start(source, mode);
    } catch (error) {
      if (this.active === source) this.fail(error);
    }
  }

  private async start(source: TelemetrySource, mode: TelemetryMode): Promise<void> {
    await source.start(
      (update) => this.apply(source, update),
      () => this.lost(source),
    );
    if (this.active === source) this._mode.set(mode);
  }

  /** Ignition off, adapter asleep, out of range: normal, so try again on its own. */
  private lost(source: TelemetrySource): void {
    if (this.active !== source) return;
    if (source !== this.obd) return void this.stop();
    this._snapshot.set(emptySnapshot());
    this._rateHz.set(null);
    this._mode.set('connecting');
    this.retry(source, 0);
  }

  private retry(source: TelemetrySource, attempt: number): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(
      () => void this.attempt(source, attempt),
      reconnectDelayS(attempt) * 1000,
    );
  }

  private async attempt(source: TelemetrySource, attempt: number): Promise<void> {
    if (this.active !== source) return;
    try {
      await this.start(source, 'obd');
      this._error.set(null);
    } catch (error) {
      if (this.active !== source) return;
      this._error.set(error);
      // Trying again cannot help when the system wants a new choice.
      if (error instanceof AdapterUnknownError) this.fail(error);
      else this.retry(source, attempt + 1);
    }
  }

  private fail(error: unknown): void {
    this.active = undefined;
    this.reset();
    this._error.set(error);
  }

  private apply(source: TelemetrySource, update: TelemetryUpdate): void {
    if (this.active !== source) return;
    // Updates arrive several times per second: only publish a new snapshot when
    // a value really changed, so nothing re-renders for identical readings.
    const current = this._snapshot();
    const changed = (Object.keys(update.values) as (keyof TelemetrySnapshot)[]).some(
      (key) => update.values[key] !== undefined && update.values[key] !== current[key],
    );
    if (changed) this._snapshot.set({ ...current, ...update.values });
    if (update.rateHz !== undefined) this._rateHz.set(Math.round(update.rateHz * 10) / 10);
  }

  private reset(): void {
    this._mode.set('off');
    this._rateHz.set(null);
    this._snapshot.set(emptySnapshot());
  }
}
