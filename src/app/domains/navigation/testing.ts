import { Provider } from '@angular/core';
import { signal } from '@angular/core';
import { SpeechInput, SpeechKind, SpeechOutput, WakeLock } from '@core/device';
import { GOOGLE_SERVICE, MAPBOX_SERVICE, OFFLINE_SERVICE, OSM_SERVICE } from './application/tokens';
import { Coordinate } from './domain/geo';
import {
  DEFAULT_MAP_PREFERENCES,
  GeoPosition,
  MapCamera,
  MapEvents,
  MapPreferences,
  MapSurface,
  MapSurfaceFactory,
  MapSurfaceOptions,
  NavigationRepository,
  NavigationService,
  PositionSource,
} from './domain/ports';
import { NO_PLACES, SavedPlaces } from './domain/saved-places';
import { HourlyWeather, WeatherSource } from './domain/weather';
import { NoRouteError, Place, ProviderId, Route } from './domain/route';

export class FakeMapSurface implements MapSurface {
  readonly data = new Map<string, object>();
  readonly layers: string[] = [];
  readonly visible = new Map<string, boolean>();
  buildings?: boolean;
  destroyed = false;

  constructor(
    readonly options: MapSurfaceOptions,
    readonly events: MapEvents,
    private current: MapCamera = options.camera,
  ) {}

  async addSource(): Promise<void> {
    /* nothing to draw */
  }
  async setData(id: string, data: object): Promise<void> {
    this.data.set(id, data);
  }
  async addLayer(layer: object): Promise<void> {
    this.layers.push((layer as { id: string }).id);
  }
  async setVisible(id: string, visible: boolean): Promise<void> {
    this.visible.set(id, visible);
  }
  async addIcon(): Promise<void> {
    /* nothing to draw */
  }
  async setBuildings(visible: boolean): Promise<void> {
    this.buildings = visible;
  }
  moveTo(camera: MapCamera): void {
    this.current = camera;
  }
  preload(): void {
    /* nothing to load */
  }
  async setLight(): Promise<void> {
    /* nothing to draw */
  }
  camera(): MapCamera {
    return this.current;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

export class FakeMapSurfaceFactory extends MapSurfaceFactory {
  readonly surfaces: FakeMapSurface[] = [];
  /** Error to throw per map kind. */
  readonly failures = new Map<string, unknown>();

  get current(): FakeMapSurface {
    return this.surfaces[this.surfaces.length - 1];
  }

  async create(
    _container: HTMLElement,
    options: MapSurfaceOptions,
    events: MapEvents,
  ): Promise<MapSurface> {
    const failure = this.failures.get(options.kind);
    if (failure) throw failure;
    const surface = new FakeMapSurface(options, events);
    this.surfaces.push(surface);
    return surface;
  }
}

export class FakeNavigationService extends NavigationService {
  routes = 0;
  nextRoute: Route | Error = new NoRouteError();
  places: Place[] | Error = [];

  constructor(readonly id: ProviderId) {
    super();
  }
  async route(): Promise<Route> {
    this.routes++;
    if (this.nextRoute instanceof Error) throw this.nextRoute;
    return this.nextRoute;
  }
  async search(): Promise<Place[]> {
    if (this.places instanceof Error) throw this.places;
    return this.places;
  }
  suggested = 0;
  suggest(): Promise<Place[]> {
    this.suggested++;
    return this.search();
  }
}

export class FakePositionSource extends PositionSource {
  allowed = false;
  denied = false;
  private listener?: (position: GeoPosition) => void;

  async granted(): Promise<boolean> {
    return this.allowed;
  }
  async watch(onPosition: (position: GeoPosition) => void): Promise<() => void> {
    if (this.denied) throw new Error('denied');
    this.listener = onPosition;
    return () => (this.listener = undefined);
  }
  background: string | null = null;
  async setBackground(message: string | null): Promise<void> {
    this.background = message;
  }
  emit(coordinate: Coordinate, heading: number | null = null, speedKmh?: number): void {
    this.listener?.({ coordinate, heading, accuracyM: 5, speedKmh });
  }
}

export class FakeNavigationRepository extends NavigationRepository {
  preferences: MapPreferences = DEFAULT_MAP_PREFERENCES;
  exhausted: Record<string, string> = {};

  async loadPreferences(): Promise<MapPreferences> {
    return this.preferences;
  }
  async savePreferences(preferences: MapPreferences): Promise<void> {
    this.preferences = preferences;
  }
  async loadExhausted(): Promise<Record<string, string>> {
    return this.exhausted;
  }
  async saveExhausted(entries: Record<string, string>): Promise<void> {
    this.exhausted = entries;
  }

  places: SavedPlaces = NO_PLACES;
  async loadPlaces(): Promise<SavedPlaces> {
    return this.places;
  }
  async savePlaces(places: SavedPlaces): Promise<void> {
    this.places = places;
  }
}

export class FakeWeather extends WeatherSource {
  forecast: HourlyWeather | null = null;
  async hourly(places: readonly Coordinate[]): Promise<(HourlyWeather | null)[]> {
    return places.map(() => this.forecast);
  }
}

export class FakeSpeech extends SpeechOutput {
  readonly busy = signal(false);
  readonly said: string[] = [];
  readonly kinds: SpeechKind[] = [];
  /** false: everything is interrupted */
  completes = true;
  async speak(...[text, , , kind]: Parameters<SpeechOutput['speak']>): Promise<boolean> {
    this.said.push(text);
    this.kinds.push(kind ?? 'nav');
    return this.completes;
  }
  async stop(): Promise<void> {
    /* silent */
  }
}

export class FakeMicrophone extends SpeechInput {
  heard = '';
  async listen(): Promise<string> {
    return this.heard;
  }
  abort(): void {
    /* not listening */
  }
}

export class FakeWakeLock extends WakeLock {
  on = false;
  async set(on: boolean): Promise<void> {
    this.on = on;
  }
}

/** The real navigation stores on top of controllable services, map and GPS. */
export function navigationTesting() {
  const fakes = {
    maps: new FakeMapSurfaceFactory(),
    mapbox: new FakeNavigationService('mapbox'),
    google: new FakeNavigationService('google'),
    osm: new FakeNavigationService('osm'),
    /** No route by default. */
    offline: new FakeNavigationService('osm'),
    gps: new FakePositionSource(),
    repository: new FakeNavigationRepository(),
    weather: new FakeWeather(),
    speech: new FakeSpeech(),
    microphone: new FakeMicrophone(),
    wakeLock: new FakeWakeLock(),
  };
  const providers: Provider[] = [
    { provide: MapSurfaceFactory, useValue: fakes.maps },
    { provide: MAPBOX_SERVICE, useValue: fakes.mapbox },
    { provide: GOOGLE_SERVICE, useValue: fakes.google },
    { provide: OSM_SERVICE, useValue: fakes.osm },
    { provide: OFFLINE_SERVICE, useValue: fakes.offline },
    { provide: PositionSource, useValue: fakes.gps },
    { provide: NavigationRepository, useValue: fakes.repository },
    { provide: WeatherSource, useValue: fakes.weather },
    { provide: SpeechOutput, useValue: fakes.speech },
    { provide: SpeechInput, useValue: fakes.microphone },
    { provide: WakeLock, useValue: fakes.wakeLock },
  ];
  return { ...fakes, providers };
}
