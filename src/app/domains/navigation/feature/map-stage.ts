import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslatePipe } from '@core/i18n';
import { SettingsStore } from '@domains/settings';
import { TelemetryStore } from '@domains/telemetry';
import { UnitsStore } from '@core/units';
import { distanceIn, formatDistanceIn, temperatureIn } from '@shared/kernel/units';
import { isLightTheme } from '@shared/kernel/theme';
import { filter } from 'rxjs';
import { MapScene } from '../application/map-scene';
import { RouteExtrasStore } from '../application/route-extras.store';
import { Coordinate, fitPoints, panCenter } from '../domain/geo';
import { WEATHER_ICONS } from '../domain/weather';
import { NavigationStore } from '../application/navigation.store';
import { MapPinsStore } from '../application/map-pins.store';
import { PositionStore, VehiclePosition } from '../application/position.store';
import { formatDuration, maneuverIcon } from '../domain/guidance';
import { MapKind } from '../domain/map-choice';
import {
  DEFAULT_MAP_PREFERENCES,
  MapCamera,
  MapPreferences,
  MapView,
  nextMapView,
  MapSurface,
  MapSurfaceFactory,
  NavigationRepository,
} from '../domain/ports';
import { SearchPanel } from './search-panel';

/** Extras on the trip card are shown this long, then they fade out. */
const EXTRA_SHOWN_MS = 20_000;
/** The weather comes back now and then. */
const WEATHER_AGAIN_MS = 600_000;
const START_CENTER = [8.5417, 47.3769] as const;
const FOLLOW_INTERVAL_MS = 350;
/** After a gesture the camera leaves the map alone for this long. */
const USER_PAUSE_MS = 1200;
const NEAR_M = 160;
const FOCUS_ZOOM = 17.5;
/** Behind the arrow, the car stands below the middle, to see more of what comes. */
const CAR_BELOW_MIDDLE = 0.12;
/** On a lower map (phone) the trip card would cover the car there. */
const LOW_MAP_PX = 480;

/** The large map with search, guidance and map buttons. */
@Component({
  selector: 'app-map-stage',
  imports: [SearchPanel, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './map-stage.html',
  styleUrl: './map-stage.scss',
})
export class MapStage {
  protected readonly navigation = inject(NavigationStore);
  protected readonly extras = inject(RouteExtrasStore);
  private readonly units = inject(UnitsStore).units;
  private readonly positions = inject(PositionStore);
  private readonly pins = inject(MapPinsStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly factory = inject(MapSurfaceFactory);
  private readonly repository = inject(NavigationRepository);
  protected readonly mode = inject(TelemetryStore).mode;

  private readonly mapElement = viewChild.required<ElementRef<HTMLElement>>('map');
  private readonly searchPanel = viewChild(SearchPanel);

  private surface?: MapSurface;
  private readonly scene = signal<MapScene | null>(null);
  protected readonly mapState = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly preferences = signal<MapPreferences>(DEFAULT_MAP_PREFERENCES);
  private readonly preferencesLoaded = signal(false);
  private readonly free = signal(false);
  protected readonly view = computed<MapView>(() =>
    this.free() ? 'free' : this.preferences().follow,
  );
  protected readonly viewIcon: Record<MapView, string> = {
    free: 'ti-hand-move',
    heading: 'ti-navigation',
    north: 'ti-compass',
  };
  protected readonly clock = signal(time(Date.now()));
  private readonly retries = signal(0);
  private lastMove = 0;
  private lastUser = 0;

  private readonly dark = computed(() => !isLightTheme(this.settingsStore.settings().theme));
  private readonly mapKey = computed(() => {
    const kind = this.navigation.mapKind();
    const token = this.navigation.mapToken();
    return JSON.stringify([kind, this.dark(), token, this.retries()]);
  });
  protected readonly hasTraffic = computed(() => this.navigation.mapKind() !== 'ofm');
  protected readonly trafficOn = computed(() => this.settingsStore.settings().map.trafficLayer);
  protected readonly voiceOn = computed(() => this.settingsStore.settings().voice.navigation);

  protected readonly guidance = computed(() => {
    const progress = this.navigation.progress();
    if (!progress) return null;
    const { next, then, distanceM } = progress;
    const near = distanceM < NEAR_M && next.maneuver.type !== 'arrive';
    return {
      icon: maneuverIcon(next.maneuver),
      distance: formatDistanceIn(distanceM, this.units()),
      text: this.navigation.instruction(next),
      then: then ? this.navigation.instruction(then) : '',
      near,
      nearPercent: Math.max(0, Math.min(100, (1 - distanceM / NEAR_M) * 100)),
    };
  });

  protected readonly eta = computed(() => {
    const route = this.navigation.route();
    if (!route) return null;
    const progress = this.navigation.progress();
    const seconds = progress?.remainingS ?? route.durationS;
    this.clock(); // keeps the arrival time current while standing
    return {
      arrival: time(Date.now() + seconds * 1000),
      duration: formatDuration(seconds),
      distance: formatDistanceIn(progress?.remainingM ?? route.line.lengthM, this.units()),
      provider: { mapbox: 'Mapbox', google: 'Google', osm: 'OpenStreetMap' }[route.provider],
      delayMinutes: route.delayS >= 60 ? Math.round(route.delayS / 60) : 0,
    };
  });

  protected readonly weatherOpen = signal(false);
  protected readonly weather = computed(() =>
    this.extras.weather().map((point) => ({
      place: point.alongM < 1000 ? '' : this.kmText(point.alongM),
      time: time(point.arrivalMs),
      icon: WEATHER_ICONS[point.kind],
      kind: point.kind,
      level: point.level,
      temperature: Math.round(temperatureIn(point.temperature, this.units()).value),
      rain: point.precipitationMm > 0 ? point.precipitationMm.toFixed(1) + ' mm' : '',
    })),
  );
  protected readonly weatherSummary = computed(() => {
    const worst = this.extras.worst();
    if (!worst) return null;
    return {
      icon: WEATHER_ICONS[worst.kind],
      kind: worst.kind,
      level: worst.level,
      from: worst.level && worst.alongM > 1000 ? this.kmText(worst.alongM) : '',
      lowest: Math.min(...this.weather().map((point) => point.temperature)),
    };
  });
  /** Since when the destination is set, and when the weather on the way last changed. */
  private weatherKey: string | null = null;
  private readonly routeSince = signal(0);
  private readonly weatherSince = signal(0);
  private readonly now = signal(Date.now());
  /** Offered at the start of the route only, and while it is being saved. */
  protected readonly offlineShown = computed(
    () =>
      this.extras.offline().kind === 'saving' || this.now() - this.routeSince() < EXTRA_SHOWN_MS,
  );
  /** At the start, now and then again, and when the weather on the way changes. */
  protected readonly weatherShown = computed(() => {
    if (this.weatherOpen()) return true;
    const now = this.now();
    return (
      now - this.weatherSince() < EXTRA_SHOWN_MS ||
      (now - this.routeSince()) % WEATHER_AGAIN_MS < EXTRA_SHOWN_MS
    );
  });
  protected readonly offlinePercent = computed(() => {
    const state = this.extras.offline();
    return state.kind === 'saving' ? Math.round(state.share * 100) : null;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    void this.positions.start(false);
    void this.repository
      .loadPreferences()
      .then((preferences) => this.preferences.set(preferences))
      .catch(() => undefined)
      .finally(() => this.preferencesLoaded.set(true));

    const timer = setInterval(() => {
      this.clock.set(time(Date.now()));
      this.now.set(Date.now());
    }, 5000);
    effect(() => {
      if (this.navigation.destination()) untracked(() => this.routeSince.set(Date.now()));
    });
    effect(() => {
      const summary = this.weatherSummary();
      const key = summary && `${summary.kind}|${summary.level}`;
      untracked(() => {
        if (key && key !== this.weatherKey) this.weatherSince.set(Date.now());
        this.weatherKey = key;
      });
    });
    destroyRef.onDestroy(() => {
      clearInterval(timer);
      this.surface?.destroy();
    });

    // The dock entry "navigation" means: search for a destination.
    const router = inject(Router);
    router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        if (event.urlAfterRedirects === '/navigation') this.focusSearch();
      });

    effect((onCleanup) => {
      if (!this.preferencesLoaded()) return;
      const key = this.mapKey();
      const container = this.mapElement().nativeElement;
      let cancelled = false;
      onCleanup(() => (cancelled = true));
      untracked(() => void this.openMap(key, container, () => cancelled));
    });
    effect(() => {
      const scene = this.scene();
      const route = this.navigation.route();
      if (scene) void scene.showRoute(route).catch(ignore);
    });
    effect(() => {
      const scene = this.scene();
      const visible = this.trafficOn();
      if (scene) void scene.showTraffic(visible).catch(ignore);
    });
    effect(() => {
      const scene = this.scene();
      const position = this.positions.position();
      if (!scene || !position || document.hidden) return;
      void scene.showPosition(position.coordinate, position.heading).catch(ignore);
      untracked(() => this.followCar(false));
    });
    effect(() => {
      const scene = this.scene();
      const pins = this.pins.pins();
      if (scene) void scene.showPins(pins).catch(ignore);
    });
    effect(() => {
      const scene = this.scene();
      const track = this.pins.track();
      if (!scene) return;
      void scene.showTrack(track).catch(ignore);
      if (track) untracked(() => this.fit(track));
    });
    effect(() => {
      const focus = this.pins.focus();
      if (!focus) return;
      untracked(() => {
        this.free.set(true);
        this.move({ center: focus.coordinate, zoom: FOCUS_ZOOM });
      });
    });
    effect(() => {
      if (this.navigation.destination()) untracked(() => this.recenter());
    });
  }

  /** Free, behind the arrow or north up. The zoom stays as the user chose it. */
  protected changeView(): void {
    const view = nextMapView(this.view());
    if (view === 'free') return this.free.set(true);
    this.pins.showTrack(null);
    this.remember({ follow: view });
    this.recenter();
  }

  private recenter(): void {
    this.free.set(false);
    void this.positions.start(true);
    this.lastUser = 0;
    this.followCar(true);
  }

  /** Shows the whole route; "centre" returns to the car. */
  protected overview(): void {
    const points = this.navigation.route()?.line.points;
    if (points) this.fit(points);
  }

  private fit(points: readonly Coordinate[]): void {
    if (!this.surface) return;
    this.free.set(true);
    const { clientWidth, clientHeight } = this.mapElement().nativeElement;
    // Room for the guidance above and the cards below.
    const view = fitPoints(points, clientWidth - 160, clientHeight - 300);
    this.surface.moveTo({ ...view, bearing: 0, pitch: 0 }, 600);
  }

  /** The trip card shows arrival and remaining time only. */
  protected readonly etaFolded = computed(() => !!this.preferences().etaFolded);

  protected toggleEta(): void {
    this.remember({ etaFolded: !this.etaFolded() });
  }

  protected toggleTilt(): void {
    this.remember({ tilted: !this.preferences().tilted });
    const { tilted } = this.preferences();
    void this.surface?.setBuildings(tilted).catch(ignore);
    this.move({ pitch: tilted ? 55 : 0 });
    this.followCar(true);
  }

  protected zoom(step: number): void {
    const camera = this.surface?.camera();
    if (!camera) return;
    const zoom = Math.max(2, Math.min(20, camera.zoom + step));
    this.rememberZoom(zoom);
    this.move({ zoom });
  }

  protected toggleTraffic(): void {
    void this.settingsStore.update({ map: { trafficLayer: !this.trafficOn() } });
  }

  protected toggleVoice(): void {
    void this.settingsStore.update({ voice: { navigation: !this.voiceOn() } });
  }

  private kmText(metres: number): string {
    const { value, unit } = distanceIn(metres / 1000, this.units());
    return `${Math.round(value)} ${unit}`;
  }

  protected retry(): void {
    this.retries.update((n) => n + 1);
  }

  private focusSearch(): void {
    this.searchPanel()?.focus();
  }

  private async openMap(
    key: string,
    container: HTMLElement,
    cancelled: () => boolean,
  ): Promise<void> {
    const [kind, dark, token] = JSON.parse(key) as [MapKind, boolean, string];
    const camera = this.surface?.camera() ?? this.startCamera();
    this.scene.set(null);
    this.surface?.destroy();
    this.surface = undefined;
    this.mapState.set('loading');
    // Every map gets its own element, so a late one cannot disturb the next.
    const element = document.createElement('div');
    element.className = 'map-host';
    container.replaceChildren(element);

    let surface: MapSurface | undefined;
    try {
      surface = await this.factory.create(
        element,
        { kind, dark, token, camera },
        {
          onUserMove: (by, moved) => this.userMoved(by, moved),
          onFailure: (rejected) => {
            if (!cancelled()) this.navigation.mapFailed(rejected);
          },
        },
      );
      if (cancelled()) return surface.destroy();
      const scene = new MapScene(surface, kind);
      await scene.build();
      await surface.setBuildings(this.preferences().tilted).catch(ignore);
      if (cancelled()) return surface.destroy();
      this.surface = surface;
      this.mapState.set('ready');
      this.scene.set(scene);
    } catch (error) {
      surface?.destroy();
      if (cancelled()) return;
      console.warn('Map failed', error);
      if (kind === 'ofm') this.mapState.set('failed');
      else this.navigation.mapFailed(!!(error as { rejected?: boolean } | null)?.rejected);
    }
  }

  private startCamera(): MapCamera {
    return {
      center: this.positions.position()?.coordinate ?? START_CENTER,
      zoom: this.baseZoom() + this.preferences().zoomOffset,
      bearing: this.bearing(),
      pitch: this.preferences().tilted ? 55 : 0,
    };
  }

  private followCar(now: boolean): void {
    const position = this.positions.position();
    const time = Date.now();
    if (!this.surface || !position || this.free()) return;
    if (!now && time - this.lastMove < FOLLOW_INTERVAL_MS) return;
    if (time - this.lastUser < USER_PAUSE_MS) return;
    this.lastMove = time;
    const camera = this.startCamera();
    this.surface.moveTo({ ...camera, center: this.followCenter(position, camera) }, 400);
  }

  private followCenter({ coordinate }: VehiclePosition, camera: MapCamera): Coordinate {
    const { clientHeight } = this.mapElement().nativeElement;
    const below = clientHeight < LOW_MAP_PX ? 0 : clientHeight * CAR_BELOW_MIDDLE;
    if (this.view() !== 'heading' || !below) return coordinate;
    return panCenter(coordinate, camera.zoom, camera.bearing, camera.pitch, 0, below);
  }

  private move(change: Partial<MapCamera>): void {
    const camera = this.surface?.camera();
    if (camera) this.surface?.moveTo({ ...camera, ...change }, 300);
  }

  private userMoved(by: 'pan' | 'zoom' | 'rotate', camera: MapCamera): void {
    this.lastUser = Date.now();
    if (by === 'pan') this.free.set(true);
    if (by === 'zoom') this.rememberZoom(camera.zoom);
  }

  private baseZoom(): number {
    return this.navigation.route() ? 17 : 16;
  }

  private bearing(): number {
    return this.view() === 'heading' ? (this.positions.position()?.heading ?? 0) : 0;
  }

  private rememberZoom(zoom: number): void {
    this.remember({ zoomOffset: Math.max(-6, Math.min(5, zoom - this.baseZoom())) });
  }

  private saveTimer?: ReturnType<typeof setTimeout>;
  private remember(change: Partial<MapPreferences>): void {
    this.preferences.update((preferences) => ({ ...preferences, ...change }));
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(
      () => void this.repository.savePreferences(this.preferences()).catch(ignore),
      500,
    );
  }
}

function time(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
}

function ignore(): void {
  // Drawing on a map that was just replaced; the new one gets the same data.
}
