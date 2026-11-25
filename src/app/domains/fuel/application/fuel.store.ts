import { Injectable, computed, inject, signal } from '@angular/core';
import { SpeechOutput } from '@core/device';
import { TranslateService } from '@core/i18n';
import { UnitsStore } from '@core/units';
import { MapPinsStore, NavigationStore, PositionStore, distanceM, snap } from '@domains/navigation';
import { SettingsStore } from '@domains/settings';
import { TelemetryStore } from '@domains/telemetry';
import { formatDistanceIn } from '@shared/kernel/units';
import {
  LonLat,
  RatedStation,
  Station,
  StationSource,
  mergeStations,
  rateStations,
} from '../domain/stations';
import {
  LowFuelWarning,
  TankRepository,
  UNKNOWN_TANK,
  afterDriving,
  averagePer100Km,
  litresIn,
  rangeKm,
} from '../domain/tank';

export type FuelScope = 'near' | 'route';
export type SearchState = 'idle' | 'searching' | 'empty' | 'failed' | 'no_position';

const TICK_MS = 1000;
const SAVE_TICKS = 30;
const NEAR_M = 8000;
const CORRIDOR_M = 2000;
const ROUTE_STEP_M = 4000;
const MAX_ROUTE_POINTS = 20;
const MAX_STATIONS = 6;
const PIN = 'fuel-';

/** Tank level, range and filling stations. Runs from app start. */
@Injectable({ providedIn: 'root' })
export class FuelStore {
  private readonly repository = inject(TankRepository);
  private readonly source = inject(StationSource);
  private readonly telemetry = inject(TelemetryStore);
  private readonly navigation = inject(NavigationStore);
  private readonly positions = inject(PositionStore);
  private readonly pins = inject(MapPinsStore);
  private readonly settings = inject(SettingsStore).settings;
  private readonly speech = inject(SpeechOutput);
  private readonly translate = inject(TranslateService);
  private readonly units = inject(UnitsStore).units;

  private readonly tank = signal(UNKNOWN_TANK);
  private readonly _stations = signal<readonly RatedStation[]>([]);
  private readonly _state = signal<SearchState>('idle');
  private readonly _scope = signal<FuelScope>('near');
  private readonly _alert = signal(false);
  private readonly warning = new LowFuelWarning();
  private loaded?: Promise<void>;
  private ticks = 0;
  private lastTick = 0;
  private searchId = 0;

  readonly stations = this._stations.asReadonly();
  readonly state = this._state.asReadonly();
  readonly scope = this._scope.asReadonly();
  /** The range is short; shown until confirmed. */
  readonly alert = this._alert.asReadonly();
  readonly fromSensor = computed(() => this.telemetry.snapshot().fuelLevel !== null);
  readonly tankSizeL = computed(() => this.settings().vehicle.tankL);
  readonly litres = computed(() =>
    litresIn(this.tank(), this.telemetry.snapshot().fuelLevel, this.tankSizeL()),
  );
  readonly average = computed(() => averagePer100Km(this.tank()));
  readonly rangeKm = computed(() => rangeKm(this.litres(), this.average()));
  /** What filling up costs about, at the price from the settings. */
  readonly fillCost = computed(() => {
    const litres = this.litres();
    const size = this.tankSizeL();
    if (litres === null || size === null) return null;
    return Math.max(0, size - litres) * this.settings().fuelPrice;
  });
  readonly hasRoute = computed(() => this.navigation.route() !== null);

  /** Loads the tank and starts counting; safe to call repeatedly. */
  start(): Promise<void> {
    this.loaded ??= this.repository
      .load()
      .then((state) => this.tank.set({ ...UNKNOWN_TANK, ...state }))
      .catch((error: unknown) => console.warn('Loading the tank failed', error))
      .then(() => {
        this.lastTick = Date.now();
        setInterval(() => this.tick(), TICK_MS);
      });
    return this.loaded;
  }

  setLitres(litres: number | null): Promise<void> {
    const size = this.tankSizeL() ?? Infinity;
    const value = litres === null ? null : Math.max(0, Math.min(size, litres));
    this.tank.update((tank) => ({ ...tank, litres: value }));
    this._alert.set(false);
    return this.save();
  }

  fillUp(): Promise<void> {
    return this.setLitres(this.tankSizeL());
  }

  confirmAlert(): void {
    this._alert.set(false);
  }

  /** Looks for stations around the car or along the route. */
  async search(scope: FuelScope): Promise<void> {
    const id = ++this.searchId;
    this._scope.set(scope);
    await this.positions.start(true);
    const points = this.searchPoints(scope);
    if (!points.length) return this.finish(id, [], 'no_position');
    this.finish(id, [], 'searching');
    const radius = scope === 'route' ? CORRIDOR_M : NEAR_M;
    const details = this.source.detailed(points, radius).catch(() => null);
    const quick = await this.source.around(points, radius).catch(() => null);
    if (quick?.length) this.show(id, quick);
    const detailed = await details;
    const all = mergeStations(quick ?? [], detailed ?? []);
    if (all.length) this.show(id, all);
    else this.finish(id, [], quick || detailed ? 'empty' : 'failed');
  }

  async goTo(station: Station): Promise<boolean> {
    const { name, address, at } = station;
    return this.navigation.navigateTo({
      name: name || this.t('fuel.station'),
      detail: address,
      coordinate: at,
    });
  }

  showOnMap(station: Station): void {
    this.pins.show(station.at);
  }

  /** Removes the stations from list and map. */
  clear(): void {
    this.finish(++this.searchId, [], 'idle');
  }

  private searchPoints(scope: FuelScope): LonLat[] {
    const position = this.positions.position();
    if (!position) return [];
    const route = this.navigation.route();
    if (scope === 'near' || !route) return [position.coordinate];
    const from = this.navigation.progress()?.alongM ?? 0;
    const step = Math.max(ROUTE_STEP_M, (route.line.lengthM - from) / MAX_ROUTE_POINTS);
    const points: LonLat[] = [];
    let next = from;
    route.line.points.forEach((point, i) => {
      if (route.line.cumulative[i] < next || points.length >= MAX_ROUTE_POINTS) return;
      points.push(point);
      next = route.line.cumulative[i] + step;
    });
    return points.length ? points : [position.coordinate];
  }

  private show(id: number, stations: readonly Station[]): void {
    const rated = rateStations(
      stations,
      this.settings().vehicle.fuelType,
      (station) => this.distanceTo(station),
      new Date(),
      MAX_STATIONS,
    ).filter(({ distanceM: distance }) => Number.isFinite(distance));
    this.finish(id, rated, rated.length ? 'idle' : 'empty');
  }

  /** As the crow flies, or along the route to the place next to the station. */
  private distanceTo({ at }: Station): number {
    const here = this.positions.position()?.coordinate;
    const route = this.navigation.route();
    if (this._scope() === 'route' && route) {
      const { alongM, offsetM } = snap(route.line, at);
      const ahead = alongM - (this.navigation.progress()?.alongM ?? 0);
      // Passed already, or too far from the road.
      return ahead < 0 || offsetM > CORRIDOR_M ? Infinity : ahead + offsetM;
    }
    return here ? distanceM(here, at) : Infinity;
  }

  private finish(id: number, stations: readonly RatedStation[], state: SearchState): void {
    if (id !== this.searchId) return;
    for (let i = 0; i < MAX_STATIONS; i++) {
      const station = stations[i];
      const name = station?.name || this.t('fuel.station');
      this.pins.set(PIN + i, station ? { icon: 'fuel', name, coordinate: station.at } : null);
    }
    this._stations.set(stations);
    this._state.set(state);
  }

  private tick(): void {
    const now = Date.now();
    const seconds = Math.min(5, (now - this.lastTick) / 1000);
    this.lastTick = now;
    const mode = this.telemetry.mode();
    if (mode !== 'obd' && mode !== 'demo') return;
    if (mode === 'obd') {
      // The demo drive uses no fuel.
      const { speed } = this.telemetry.snapshot();
      this.tank.update((tank) => afterDriving(tank, seconds, speed, this.telemetry.fuelRateLph()));
      if (++this.ticks % SAVE_TICKS === 0) void this.save();
    }
    if (this.warning.next(this.rangeKm())) void this.warn();
  }

  private async warn(): Promise<void> {
    this._alert.set(true);
    await this.search(this.hasRoute() ? 'route' : 'near');
    const range = formatDistanceIn((this.rangeKm() ?? 0) * 1000, this.units());
    const [nearest] = this._stations();
    const text = nearest
      ? this.t('fuel.say.low_near', {
          range,
          name: nearest.name || this.t('fuel.station'),
          distance: formatDistanceIn(nearest.distanceM, this.units()),
        })
      : this.t('fuel.say.low', { range });
    const { rate, warnings } = this.settings().voice;
    if (warnings) void this.speech.speak(text, this.translate.lang, rate, 'nav');
  }

  private save(): Promise<void> {
    return this.repository
      .save(this.tank())
      .catch((error: unknown) => console.warn('Saving the tank failed', error));
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.translate(key, params) ?? key;
  }
}
