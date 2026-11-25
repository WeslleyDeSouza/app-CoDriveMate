import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { TelemetryStore } from '@domains/telemetry';
import {
  DEFAULT_LIGHT,
  LightConnection,
  LightDevice,
  LightModule,
  LightRepository,
  LightScene,
  LightSearch,
  LightState,
  LightZone,
  ModuleState,
  OFF_COMMAND,
  STORE_COMMAND,
  driveCommand,
  isDriving,
  parseModuleState,
  withChange,
  withScene,
  withSelection,
  zoneCommands,
} from '../domain/lighting';

export type LightStatus = 'off' | 'connecting' | 'connected' | 'failed';

const RECONNECT_MS = [2000, 5000, 10_000, 30_000];
const SAVE_MS = 500;
const ALL = [0, 1, 2, 3];

/** Interior lighting; without a module the page is a preview. */
@Injectable({ providedIn: 'root' })
export class LightStore {
  private readonly module = inject(LightModule);
  private readonly repository = inject(LightRepository);
  private readonly telemetry = inject(TelemetryStore);

  private readonly _state = signal<LightState>(DEFAULT_LIGHT);
  private readonly _status = signal<LightStatus>('off');
  private readonly _module = signal<ModuleState | null>(null);
  private readonly _known = signal<LightDevice | null>(null);
  private connection?: LightConnection;
  private sending: Promise<void> = Promise.resolve();
  private run = 0;
  private loaded?: Promise<void>;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;

  readonly state = this._state.asReadonly();
  readonly status = this._status.asReadonly();
  readonly moduleState = this._module.asReadonly();
  readonly known = this._known.asReadonly();
  readonly driving = computed(() => isDriving(this.telemetry.snapshot().speed));
  /** The zone the controls show. */
  readonly shown = computed(() => {
    const { zones, selected } = this._state();
    return zones[selected[0] ?? 0];
  });

  constructor() {
    effect(() => {
      const driving = this.driving();
      if (this._status() === 'connected') untracked(() => this.dim(driving));
    });
  }

  /** Loads the state and connects a known module; safe to call repeatedly. */
  start(): Promise<void> {
    this.loaded ??= Promise.all([this.repository.load(), this.repository.loadDevice()])
      .then(([state, device]) => {
        if (state) this._state.set(state);
        if (!device) return;
        this._known.set(device);
        void this.open(device, 0);
      })
      .catch((error: unknown) => console.warn('Loading the light failed', error));
    return this.loaded;
  }

  async connect(search: LightSearch): Promise<void> {
    await this.disconnect();
    this._status.set('connecting');
    try {
      const device = await this.module.choose(search);
      this._known.set(device);
      await this.repository.saveDevice(device);
      await this.open(device, null);
    } catch {
      // Cancelled, or there is no Bluetooth.
      if (this._status() === 'connecting') this._status.set('failed');
    }
  }

  async reconnect(): Promise<void> {
    const device = this._known();
    if (device) await this.open(device, null);
  }

  async disconnect(): Promise<void> {
    this.run++;
    clearTimeout(this.retryTimer);
    const { connection } = this;
    this.connection = undefined;
    this._status.set('off');
    this._module.set(null);
    await connection?.close().catch(() => undefined);
  }

  select(zone: number): void {
    this.update(withSelection(this._state(), zone));
  }

  set(change: Partial<LightZone>): void {
    const { selected } = this._state();
    this.update(withChange(this._state(), selected, change));
    this.push(selected);
  }

  setBrightness(brightness: number): void {
    this.set({ brightness, on: brightness > 0 });
  }

  apply(scene: LightScene): void {
    this.update(withScene(this._state(), scene));
    if (scene.set) this.push(ALL);
    else this.send(OFF_COMMAND);
  }

  setDriveBrightness(driveBrightness: number): void {
    this.update({ ...this._state(), driveBrightness });
    this.dim(this.driving());
  }

  /** Keeps the present light in the module as the one after switching on. */
  store(): void {
    this.send(STORE_COMMAND);
  }

  private push(zones: readonly number[]): void {
    zoneCommands(this._state().zones, zones).forEach((command) => this.send(command));
  }

  private dim(driving: boolean): void {
    this.send(driveCommand(driving, this._state().driveBrightness));
  }

  /** One after the other; a lost command is no reason to stop. */
  private send(command: Uint8Array): void {
    const { connection } = this;
    if (!connection) return;
    this.sending = this.sending
      .then(() => connection.send(command))
      .catch((error: unknown) => console.warn('Light command failed', error));
  }

  /** @param attempt number of automatic tries, null = asked for by the user */
  private async open(device: LightDevice, attempt: number | null): Promise<void> {
    const run = ++this.run;
    clearTimeout(this.retryTimer);
    this._status.set('connecting');
    try {
      const connection = await this.module.open(
        device,
        (data) => this._module.set(parseModuleState(data)),
        () => this.lost(run, device),
      );
      if (run !== this.run) return void connection.close().catch(() => undefined);
      this.connection = connection;
      this._status.set('connected');
      this.push(ALL);
    } catch {
      if (run !== this.run) return;
      this._status.set(attempt === null ? 'failed' : 'off');
      if (attempt !== null) this.retry(device, attempt + 1);
    }
  }

  private lost(run: number, device: LightDevice): void {
    if (run !== this.run) return;
    this.connection = undefined;
    this._module.set(null);
    this._status.set('off');
    this.retry(device, 0);
  }

  private retry(device: LightDevice, attempt: number): void {
    const pause = RECONNECT_MS[Math.min(attempt, RECONNECT_MS.length - 1)];
    this.retryTimer = setTimeout(() => void this.open(device, attempt), pause);
  }

  private update(state: LightState): void {
    this._state.set(state);
    clearTimeout(this.saveTimer);
    // Sliders change many times per second.
    this.saveTimer = setTimeout(
      () => void this.repository.save(state).catch((e: unknown) => console.warn(e)),
      SAVE_MS,
    );
  }
}
