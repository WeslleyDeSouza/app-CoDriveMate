import { Injectable, computed, inject, signal } from '@angular/core';
import { BleTrace, BleTransport } from '@core/bluetooth';
import { LightStore } from '@domains/lighting';
import { RemoteStore } from '@domains/media';
import { NavigationStore, PositionStore } from '@domains/navigation';
import { SceneStore } from '@domains/scene3d';
import { SettingsStore } from '@domains/settings';
import { TelemetryStore } from '@domains/telemetry';
import { DATA_KINDS, DataKind, ReadingRepository, SavedReadings } from '../domain/readings';

export { DATA_KINDS } from '../domain/readings';
export type { DataKind } from '../domain/readings';
/** Time for the module to answer. */
const ANSWER_MS = 1500;

/** Raw data of the hardware as JSON, for finding faults. Nothing is sent anywhere. */
@Injectable()
export class DataStore {
  private readonly telemetry = inject(TelemetryStore);
  private readonly light = inject(LightStore);
  private readonly remote = inject(RemoteStore);
  private readonly ble = inject(BleTransport);
  private readonly trace = inject(BleTrace);
  private readonly scene = inject(SceneStore);
  private readonly positions = inject(PositionStore);
  private readonly navigation = inject(NavigationStore);
  private readonly settings = inject(SettingsStore).settings;
  private readonly repository = inject(ReadingRepository);
  private readonly _saved = signal<SavedReadings>({});
  private readonly _shown = signal<{ kind: DataKind; at: number } | null>(null);

  private readonly _json = signal('');
  private readonly _busy = signal<DataKind | null>(null);
  private readonly _share = signal(0);
  private readonly _failed = signal<'not_connected' | 'failed' | null>(null);
  private run = 0;

  readonly json = this._json.asReadonly();
  readonly busy = this._busy.asReadonly();
  readonly share = this._share.asReadonly();
  readonly failed = this._failed.asReadonly();
  /** The last reading per module, kept on the device. */
  readonly saved = computed(() =>
    DATA_KINDS.flatMap((kind) => {
      const reading = this._saved()[kind];
      return reading ? [{ kind, at: reading.at }] : [];
    }),
  );
  /** Which reading the JSON is. */
  readonly shown = this._shown.asReadonly();

  constructor() {
    void this.repository
      .load()
      .then((saved) => this._saved.update((now) => ({ ...saved, ...now })))
      .catch(() => undefined);
  }

  /** Shows a saved reading again. */
  show(kind: DataKind): void {
    const reading = this._saved()[kind];
    if (!reading || this._busy()) return;
    this._failed.set(null);
    this._json.set(reading.json);
    this._shown.set({ kind, at: reading.at });
  }

  async read(kind: DataKind): Promise<void> {
    if (this._busy()) return;
    const run = ++this.run;
    this._busy.set(kind);
    this._share.set(0);
    this._failed.set(null);
    this._json.set('');
    this._shown.set(null);
    try {
      const data = await { obd: this.obd, esp: this.esp, scene: this.world }[kind].call(this, run);
      const at = Date.now();
      const head = { app: 'CoDriveMate', kind, at: new Date(at).toISOString() };
      const json = JSON.stringify({ ...head, ...data }, null, 2);
      this._json.set(json);
      this._shown.set({ kind, at });
      this._saved.update((saved) => ({ ...saved, [kind]: { at, json } }));
      // Kept for later, e.g. to copy it at the computer.
      void this.repository.save(kind, { at, json }).catch(() => undefined);
    } catch (error) {
      const unconnected = /not connected/i.test(String(error));
      this._failed.set(unconnected ? 'not_connected' : 'failed');
      if (!unconnected) console.warn('Reading the data failed', error);
    } finally {
      this._busy.set(null);
    }
  }

  /** Ends reading; what is there already is shown. */
  stop(): void {
    this.run++;
  }

  private obd(run: number): Promise<object> {
    return this.telemetry.report(
      (share) => this._share.set(share),
      () => run !== this.run,
    );
  }

  private async esp(): Promise<object> {
    await this.light.start();
    await this.remote.send('sendState').catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, ANSWER_MS));
    const light = this.light.known();
    const media = this.remote.device();
    return {
      light: {
        device: light?.name ?? null,
        status: this.light.status(),
        decoded: this.light.moduleState(),
        bluetooth: light ? await this.bluetooth(light.id) : null,
      },
      media: {
        device: media?.name ?? null,
        status: this.remote.status(),
        decoded: this.remote.nowPlaying(),
        bluetooth: media ? await this.bluetooth(media.id) : null,
      },
    };
  }

  private async bluetooth(id: string): Promise<object | null> {
    // Asking a device that is not connected may hang.
    const before = this.trace.report(id, null) as { connected?: boolean } | null;
    const found = before?.connected ? await this.ble.characteristics(id).catch(() => null) : null;
    return this.trace.report(id, found);
  }

  /** Why the surroundings in 3D may be missing; no place and no key in it. */
  private async world(): Promise<object> {
    const position = this.positions.position();
    const environment = this.scene.environment();
    const { map, keys } = this.settings();
    const { gauge, scene3d, sceneWorld, scene } = map;
    const backdrop = document.querySelector<HTMLElement>('app-scene-view .backdrop');
    const view = document.querySelector<HTMLElement>('app-scene-view');
    const size = (element: HTMLElement | null) =>
      element && `${element.clientWidth}x${element.clientHeight}`;
    return {
      position: position ? { heading: position.heading, speed: this.positions.speedKmh() } : null,
      chosen: sceneWorld,
      shown: this.scene.world(),
      available: this.scene.worlds(),
      keys: { mapbox: !!keys.mapbox, google: !!keys.google },
      mapboxUsable: this.navigation.mapboxUsable(),
      mainMap: this.navigation.mapKind(),
      surroundings: environment && {
        roadTriangles: environment.geometry.roads.index.length / 3,
        buildingTriangles: environment.geometry.buildings.index.length / 3,
      },
      mapBehindCar: backdrop
        ? { size: size(backdrop), children: backdrop.childElementCount }
        : 'missing',
      view: view && {
        size: size(view),
        background: getComputedStyle(view).backgroundImage,
        classes: view.className,
      },
      page: document.documentElement.className,
      online: navigator.onLine,
      options: { gauge, scene3d, ...scene },
      device: navigator.userAgent,
      screen: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}`,
    };
  }
}
