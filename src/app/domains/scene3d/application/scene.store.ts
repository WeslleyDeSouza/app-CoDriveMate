import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationStore, PositionStore } from '@domains/navigation';
import { SettingsStore } from '@domains/settings';
import { TelemetryStore } from '@domains/telemetry';
import { CameraMode, nextCameraMode } from '../domain/camera';
import { EnvironmentData, LonLat, ahead, cellKey, cellOf, roadNameAt } from '../domain/environment';
import {
  EnvironmentSource,
  GeometryBuilder,
  SceneEnvironment,
  ScenePose,
  SceneWorld,
} from '../domain/ports';

/** The next cell is loaded before the car gets there. */
const LOOK_AHEAD_M = 250;
const MOVING_KMH = 8;
const RETRY_MS = 8000;
/** A world without connection is tried again after this long. */
const WORLD_RETRY_MS = 120_000;

/** What the 3D view shows: pose, surroundings, route and camera. */
@Injectable({ providedIn: 'root' })
export class SceneStore {
  private readonly source = inject(EnvironmentSource);
  private readonly builder = inject(GeometryBuilder);
  private readonly positions = inject(PositionStore);
  private readonly navigation = inject(NavigationStore);
  private readonly telemetry = inject(TelemetryStore);
  private readonly settings = inject(SettingsStore);

  private readonly _environment = signal<SceneEnvironment | null>(null);
  private readonly _camera = signal<CameraMode>('auto');
  private readonly retries = signal(0);

  readonly environment = this._environment.asReadonly();
  readonly camera = this._camera.asReadonly();
  readonly enabled = computed(() => this.settings.settings().map.scene3d);
  readonly options = computed(() => this.settings.settings().map.scene);
  readonly googleKey = computed(() => this.settings.settings().keys.google);
  readonly mapboxToken = this.navigation.mapboxToken;
  private readonly failed = signal<readonly SceneWorld[]>([]);
  /** Key Google refused. */
  private readonly rejectedKey = signal('');

  /** Worlds that can be shown now, in the order of the button. */
  readonly worlds = computed<readonly SceneWorld[]>(() => {
    const usable: SceneWorld[] = ['real', 'plain'];
    if (this.navigation.mapboxUsable()) usable.push('mapbox');
    const key = this.googleKey();
    if (key && key !== this.rejectedKey()) usable.push('google');
    return usable.filter((world) => !this.failed().includes(world));
  });
  /** The chosen world, or the aerial image where it cannot be shown. */
  readonly world = computed<SceneWorld>(() => {
    const chosen = this.settings.settings().map.sceneWorld;
    return this.worlds().includes(chosen) ? chosen : 'real';
  });
  readonly carColor = computed(() => this.settings.settings().vehicle.color);
  private readonly speed = computed(() => this.telemetry.snapshot().speed);

  readonly pose = computed<ScenePose>(() => {
    const position = this.positions.position();
    return {
      at: position?.coordinate ?? null,
      heading: position?.heading ?? 0,
      speedKmh: this.speed(),
      extrapolate: !this.positions.isDemo(),
    };
  });
  private readonly routeLine = computed(() => this.navigation.route()?.line ?? null);
  /** Google and Mapbox maps show only their own provider's route. */
  readonly route = computed(() => {
    const world = this.world();
    if (world === 'google') return null;
    if (world === 'mapbox' && this.navigation.route()?.provider !== 'mapbox') return null;
    // A route of Google belongs on Google's map only.
    if (this.navigation.route()?.provider === 'google') return null;
    return this.routeLine()?.points ?? null;
  });

  /** Name of the current street. */
  readonly street = computed(() => {
    const guided = this.navigation.progress()?.street;
    if (guided) return guided;
    const environment = this._environment();
    const { at, heading, speedKmh } = this.pose();
    if (!environment || !at) return '';
    return roadNameAt(environment.data, at, heading, speedKmh > MOVING_KMH);
  });

  private readonly wantedCell = computed(() => {
    const { at, heading, speedKmh } = this.pose();
    // The street name comes from the surroundings, so every world needs them.
    if (!at || !this.enabled()) return '';
    return cellOf(ahead(at, heading, speedKmh > MOVING_KMH ? LOOK_AHEAD_M : 0)).join(',');
  });

  constructor() {
    effect((onCleanup) => {
      const wanted = this.wantedCell();
      this.retries();
      if (!wanted) return;
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      onCleanup(() => {
        cancelled = true;
        clearTimeout(timer);
      });
      untracked(() => {
        void this.load(wanted.split(',').map(Number) as unknown as LonLat, () => cancelled).then(
          (done) => {
            if (done || cancelled) return;
            timer = setTimeout(() => this.retries.update((n) => n + 1), RETRY_MS);
          },
        );
      });
    });
  }

  cycleCamera(): void {
    this._camera.update(nextCameraMode);
  }

  nextWorld(): void {
    const worlds = this.worlds();
    const next = worlds[(worlds.indexOf(this.world()) + 1) % worlds.length];
    void this.settings.update({ map: { sceneWorld: next } });
  }

  worldFailed(world: SceneWorld, keyRejected: boolean): void {
    if (keyRejected && world === 'mapbox') return this.navigation.mapFailed(true, 'mapbox');
    if (keyRejected && world === 'google') return this.rejectedKey.set(this.googleKey());
    this.failed.update((failed) => [...failed, world]);
    setTimeout(
      () => this.failed.update((failed) => failed.filter((other) => other !== world)),
      WORLD_RETRY_MS,
    );
  }

  /** Already loaded cells are shown even when the car moved on; loads never pile up. */
  private loading: Promise<unknown> = Promise.resolve();

  /** The old surroundings stay until the new ones are complete. */
  private load(cell: LonLat, cancelled: () => boolean): Promise<boolean> {
    const result = this.loading.then(() => (cancelled() ? false : this.loadNow(cell, cancelled)));
    this.loading = result;
    return result;
  }

  private async loadNow(cell: LonLat, cancelled: () => boolean): Promise<boolean> {
    const current = this._environment();
    if (current && cellKey(current.data.center) === cellKey(cell)) return true;
    try {
      const data = await this.source.load(cell);
      if (!data) return false;
      this._environment.set({ data, geometry: await this.builder.build(data) });
      void this.addDetails(data, cancelled);
      return true;
    } catch (error) {
      console.warn('Loading surroundings failed', error);
      return false;
    }
  }

  private async addDetails(data: EnvironmentData, cancelled: () => boolean): Promise<void> {
    try {
      const details = await this.source.details(data.center);
      if (!details || cancelled()) return;
      if (!details.trees.length && !details.crossings.length) return;
      const complete = { ...data, ...details };
      const geometry = await this.builder.build(complete);
      if (this._environment()?.data === data) this._environment.set({ data: complete, geometry });
    } catch (error) {
      console.warn('Loading trees and crossings failed', error);
    }
  }
}
