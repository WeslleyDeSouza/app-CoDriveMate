import { Injectable, computed, inject, signal } from '@angular/core';
import { MapPinsStore, PositionStore } from '@domains/navigation';
import { SceneStore } from '@domains/scene3d';
import { SettingsStore } from '@domains/settings';
import { TelemetryStore } from '@domains/telemetry';
import { EcoTip, Trip, TripRecorder, TripRepository, TripSource } from '../domain/trip';

const TICK_MS = 250;
const TIP_MS = 7000;
/** The live trip is shown about once per second. */
const SHOW_TICKS = 4;

/** Records drives and keeps them. Runs from app start. */
@Injectable({ providedIn: 'root' })
export class LogbookStore {
  private readonly repository = inject(TripRepository);
  private readonly telemetry = inject(TelemetryStore);
  private readonly positions = inject(PositionStore);
  private readonly scene = inject(SceneStore);
  private readonly pins = inject(MapPinsStore);
  private readonly settings = inject(SettingsStore).settings;
  private readonly recorder = new TripRecorder();

  private readonly _trips = signal<Trip[]>([]);
  private readonly _loaded = signal(false);
  private readonly _current = signal<Trip | null>(null);
  private readonly _tip = signal<EcoTip | null>(null);
  private timer?: ReturnType<typeof setInterval>;
  private tipTimer?: ReturnType<typeof setTimeout>;
  private lastTick = 0;
  private ticks = 0;

  /** Newest first. */
  readonly trips = computed(() => [...this._trips()].sort((a, b) => b.startedAt - a.startedAt));
  readonly loaded = this._loaded.asReadonly();
  readonly totalKm = computed(() => this._trips().reduce((sum, t) => sum + t.distanceKm, 0));
  /** The drive going on, null if there is none. */
  readonly current = this._current.asReadonly();
  /** Short hint for saving fuel. */
  readonly tip = this._tip.asReadonly();
  readonly averageKmh = computed(() => {
    const trip = this._current();
    const hours = trip ? (trip.endedAt - trip.startedAt) / 3_600_000 : 0;
    return trip && hours > 0.002 ? trip.distanceKm / hours : null;
  });

  start(): void {
    if (this.timer) return;
    this.lastTick = Date.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  async load(): Promise<void> {
    this._trips.set(await this.repository.all());
    this._loaded.set(true);
  }

  async save(trip: Trip): Promise<void> {
    await this.repository.save(trip);
    this._trips.update((trips) => [...trips.filter((t) => t.id !== trip.id), trip]);
  }

  async delete(id: number): Promise<void> {
    await this.repository.delete(id);
    this._trips.update((trips) => trips.filter((t) => t.id !== id));
  }

  /** Draws a drive on the large map. False if it has no positions. */
  showOnMap(trip: Trip): boolean {
    if (trip.path.length < 2) return false;
    this.pins.showTrack(trip.path);
    return true;
  }

  private source(): TripSource | null {
    const mode = this.telemetry.mode();
    if (mode === 'obd' || mode === 'demo') return mode;
    // While the adapter reconnects, GPS must not start a second trip.
    if (this.recorder.current?.source === 'obd') return null;
    return this.positions.speedKmh() === null ? null : 'gps';
  }

  private tick(): void {
    const now = Date.now();
    // In the background timers are slowed down; a longer gap is not driven through.
    const seconds = Math.min(5, (now - this.lastTick) / 1000);
    this.lastTick = now;
    const source = this.source();
    const { speed, rpm, throttle } = this.telemetry.snapshot();
    const { finished, tip } = this.recorder.next({
      now,
      seconds,
      source,
      speedKmh: source === 'gps' ? (this.positions.speedKmh() ?? 0) : speed,
      rpm,
      throttle,
      gear: this.telemetry.gear(),
      gears: this.telemetry.profile().gearRatios.length,
      rateLph: this.telemetry.fuelRateLph(),
      at: this.positions.position()?.coordinate ?? null,
      street: this.scene.street(),
      fuelPrice: this.settings().fuelPrice,
    });
    // Demo drives are shown, but not kept.
    if (finished && finished.source !== 'demo') {
      void this.save(finished).catch((e: unknown) => console.warn('Saving the trip failed', e));
    }
    if (tip && this.settings().ecoTips) this.showTip(tip);
    if (finished || ++this.ticks % SHOW_TICKS === 0) {
      const { current } = this.recorder;
      this._current.set(current && { ...current });
    }
  }

  private showTip(tip: EcoTip): void {
    this._tip.set(tip);
    clearTimeout(this.tipTimer);
    this.tipTimer = setTimeout(() => this._tip.set(null), TIP_MS);
  }
}
