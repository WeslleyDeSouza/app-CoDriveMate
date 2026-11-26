import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SpeechOutput } from '@core/device';
import { ServiceReset } from '@core/http/service-reset';
import { TranslateService } from '@core/i18n';
import { UnitsStore } from '@core/units';
import { formatDistanceIn } from '@shared/kernel/units';
import { SettingsStore } from '@domains/settings';
import {
  ProviderChain,
  QuotaExhaustedError,
  AllProvidersFailedError,
} from '@shared/kernel/provider-chain';
import { Coordinate, polyline } from '../domain/geo';
import {
  Announcement,
  AnnouncementPlan,
  announcementsAhead,
  OffRouteDetector,
  Progress,
  formatDuration,
  maneuverKey,
  progressOn,
} from '../domain/guidance';
import { chooseMap, providerOf } from '../domain/map-choice';
import { NavigationRepository, NavigationService } from '../domain/ports';
import { KeyRejectedError, Place, ProviderId, Route, RouteStep } from '../domain/route';
import { GOOGLE_SERVICE, MAPBOX_SERVICE, OFFLINE_SERVICE, OSM_SERVICE } from './tokens';
import { PositionStore } from './position.store';

const FASTER_CHECK_MS = 240_000;
const FASTER_GAIN_S = 180;
const DELAY_WARNING_S = 300;
/** More would be paid for in vain with every new route. */
const PREPARED_MANOEUVRES = 5;
const DEMO_START: Coordinate = [8.5402, 47.3782];
const DEMO_END: Coordinate = [8.553, 47.3555];

/** Route, guidance and which map provider is in use. */
@Injectable({ providedIn: 'root' })
export class NavigationStore {
  private readonly mapbox: NavigationService = inject(MAPBOX_SERVICE);
  private readonly google: NavigationService = inject(GOOGLE_SERVICE);
  private readonly osm: NavigationService = inject(OSM_SERVICE);
  private readonly offline: NavigationService = inject(OFFLINE_SERVICE);
  private readonly repository = inject(NavigationRepository);
  private readonly settings = inject(SettingsStore).settings;
  private readonly positions = inject(PositionStore);
  private readonly speech = inject(SpeechOutput);
  private readonly translate = inject(TranslateService);
  private readonly units = inject(UnitsStore).units;
  private readonly serviceReset = inject(ServiceReset);

  private readonly _route = signal<Route | null>(null);
  private readonly _destination = signal<Place | null>(null);
  private readonly _progress = signal<Progress | null>(null);
  private readonly _busy = signal(false);
  private readonly _notice = signal('');
  private readonly _arrival = signal<{ place: Place; at: number } | null>(null);
  /** Providers left alone until tomorrow or the next start. */
  private readonly paused = signal<ReadonlySet<ProviderId>>(new Set());
  private readonly rejected = signal<Partial<Record<ProviderId, string>>>({});

  readonly route = this._route.asReadonly();
  readonly destination = this._destination.asReadonly();
  readonly progress = this._progress.asReadonly();
  readonly busy = this._busy.asReadonly();
  /** Translation key of a short message for the driver, '' if none. */
  readonly notice = this._notice.asReadonly();
  /** The last destination reached under guidance, and when. */
  readonly arrival = this._arrival.asReadonly();

  readonly mapboxToken = computed(() => this.settings().keys.mapbox);
  /** A Mapbox key is there and was not refused. */
  readonly mapboxUsable = computed(() => {
    const token = this.mapboxToken();
    return !!token && token !== this.rejected().mapbox && !this.paused().has('mapbox');
  });
  private readonly googleUsable = computed(() => {
    const key = this.settings().keys.google;
    return !!key && key !== this.rejected().google && !this.paused().has('google');
  });
  private readonly chosenMap = computed(() =>
    chooseMap(this.settings().map, this.mapboxUsable(), this.googleUsable()),
  );
  /** Key for the map that is shown. */
  readonly mapToken = computed(() => {
    const kind = this.mapKind();
    return kind === 'ofm' ? '' : this.settings().keys[kind === 'google' ? 'google' : 'mapbox'];
  });
  /** The map to show; an OSM route is never drawn on a Mapbox map. */
  readonly mapKind = computed(() => (this._route()?.provider === 'osm' ? 'ofm' : this.chosenMap()));

  private readonly chain: ProviderChain<[Coordinate, Coordinate], Route>;
  private announcements = new AnnouncementPlan();
  private prepared: { route?: Route; for: string } = { for: '' };
  private offRoute = new OffRouteDetector();
  private lastFasterCheck = 0;
  private delayWarned = false;
  private requestId = 0;
  private noticeTimer?: ReturnType<typeof setTimeout>;
  private readonly restored: Promise<void>;

  constructor() {
    this.chain = new ProviderChain(
      [
        {
          id: 'google',
          isAvailable: () => this.chosenMap() === 'google',
          run: (from, to) => this.google.route(from, to),
        },
        {
          id: 'mapbox',
          isAvailable: () => providerOf(this.chosenMap()) === 'mapbox',
          run: (from, to) => this.mapbox.route(from, to),
        },
        { id: 'osm', isAvailable: () => true, run: (from, to) => this.osm.route(from, to) },
        {
          id: 'offline',
          isAvailable: () => true,
          run: (from, to) => this.offline.route(from, to),
        },
      ],
      { onExhausted: (id) => this.pause(id as ProviderId) },
    );
    this.restored = this.repository
      .loadExhausted()
      .then((entries) => {
        this.chain.restoreExhausted(entries);
        const ids: ProviderId[] = ['mapbox', 'google'];
        this.paused.set(new Set(ids.filter((id) => this.chain.isExhausted(id))));
      })
      .catch(() => undefined);

    effect(() => {
      const position = this.positions.position();
      if (position && this._route()) untracked(() => this.advance(position.coordinate));
    });
    effect(() => {
      // Another map was chosen: its provider's route replaces the one on it.
      const expected = providerOf(this.chosenMap());
      const provider = this._route()?.provider;
      const destination = untracked(this._destination);
      if (!provider || provider === 'osm' || provider === expected || !destination) return;
      untracked(() => void this.calculate(destination, 'quiet'));
    });
    effect(() => {
      if (!this.serviceReset.count()) return;
      untracked(() => {
        this.chain.clearExhausted();
        this.paused.set(new Set());
        this.rejected.set({});
        void this.repository.saveExhausted({}).catch(() => undefined);
      });
    });
    effect(() => {
      if (this.positions.isDemo()) untracked(() => void this.prepareDemo());
    });
  }

  search(text: string): Promise<Place[]> {
    return this.find(text, 'search');
  }

  /** Places for text that is still being typed. */
  suggest(text: string): Promise<Place[]> {
    return this.find(text, 'suggest');
  }

  private async find(text: string, how: 'search' | 'suggest'): Promise<Place[]> {
    const query = text.trim();
    if (query.length < 3) return [];
    await this.restored;
    const near = this.positions.position()?.coordinate ?? null;
    const lang = this.translate.lang;
    // Places belong to the map they are shown on, like routes.
    const provider = providerOf(this.mapKind());
    // Google counts every search, so typing uses the free suggestions.
    if (provider !== 'osm' && !(provider === 'google' && how === 'suggest')) {
      try {
        return await this.service(provider)[how](query, near, lang);
      } catch (error) {
        this.noteFailure(error);
      }
    }
    return this.osm[how](query, near, lang);
  }

  /** Calculates a route to `place` and starts guidance. False if there is none. */
  async navigateTo(place: Place): Promise<boolean> {
    if (!this.positions.position()) {
      await this.positions.start(true);
      if (!this.positions.position()) {
        this.show(this.positions.status() === 'denied' ? 'no_permission' : 'no_position');
        return false;
      }
    }
    return this.calculate(place, 'start');
  }

  /** Expected duration to a place, without starting guidance; null if there is no route. */
  async estimate(place: Place): Promise<{ durationS: number; delayS: number } | null> {
    const from = this.positions.position()?.coordinate;
    if (!from) return null;
    try {
      await this.restored;
      const { result } = await this.chain.run(from, place.coordinate);
      return { durationS: result.durationS, delayS: result.delayS };
    } catch {
      return null;
    }
  }

  stop(): void {
    this.requestId++;
    this._route.set(null);
    this._destination.set(null);
    this._progress.set(null);
    this.prepared = { for: '' };
    this.speech.prepare([], this.translate.lang, this.settings().voice.rate);
    void this.speech.stop();
  }

  /** Ended by the user. */
  end(): void {
    this.stop();
    this.say(this.t('navigation.say.ended'));
  }

  /** The map could not be shown with the Mapbox key. */
  mapFailed(keyRejected: boolean, of?: ProviderId): void {
    const provider = of ?? providerOf(this.mapKind());
    if (provider === 'osm') return;
    if (keyRejected) this.reject(provider);
    // A map that fails for another reason is left alone until the next start.
    else this.paused.update((paused) => new Set(paused).add(provider));
    this.show('map_fallback');
    const destination = this._destination();
    // Map and route must match: get the route again from OSM.
    if (this._route()?.provider === provider && destination)
      void this.calculate(destination, 'quiet');
  }

  /** Text of a manoeuvre in the current language. */
  instruction(step: RouteStep): string {
    if (step.text) return step.text;
    const text = this.t('navigation.' + maneuverKey(step.maneuver), {
      exit: step.maneuver.exit ?? '',
    });
    if (step.maneuver.type === 'arrive') return text;
    return step.street ? text + this.t('navigation.on_street', { street: step.street }) : text;
  }

  private async calculate(place: Place, kind: 'start' | 'reroute' | 'quiet'): Promise<boolean> {
    const from = this.positions.position()?.coordinate;
    if (!from) return false;
    const id = ++this.requestId;
    this._busy.set(true);
    try {
      await this.restored;
      const { result, skipped, providerId } = await this.chain.run(from, place.coordinate);
      if (id !== this.requestId) return false;
      if (providerId === 'offline') this.show('offline_route');
      else if (skipped.length) this.show('provider_switched');
      this.adopt(result, place);
      if (kind === 'start') {
        this.delayWarned = result.delayS > DELAY_WARNING_S;
        this.sayStart(result, place);
      }
      return true;
    } catch (error) {
      if (id !== this.requestId) return false;
      if (error instanceof AllProvidersFailedError) {
        error.failures.forEach((failure) => this.noteFailure(failure.error));
      }
      this.show('no_route');
      return false;
    } finally {
      if (id === this.requestId) this._busy.set(false);
    }
  }

  private adopt(route: Route, place: Place): void {
    // A new route to the same destination must not announce the same turn again.
    if (place !== this._destination()) this.announcements = new AnnouncementPlan();
    this.lastFasterCheck = Date.now();
    this._destination.set(place);
    this._progress.set(null);
    this._route.set(route);
    if (this.positions.isDemo()) this.positions.driveDemoAlong(route.line);
  }

  private advance(position: Coordinate): void {
    const route = this._route();
    const destination = this._destination();
    if (!route || !destination) return;
    const progress = progressOn(route, position, this._progress()?.alongM);
    this._progress.set(progress);

    if (progress.arrived) {
      this.stop();
      this.say(this.t('navigation.say.arrived'));
      this._arrival.set({ place: destination, at: Date.now() });
      return;
    }
    const announcement = this.announcements.next(progress, route);
    if (announcement) this.say(this.announcementText(progress.next, announcement));
    this.prepareVoice(route, progress);

    const now = Date.now();
    if (!this.positions.isDemo() && this.offRoute.shouldReroute(progress.offRouteM, now)) {
      this.say(this.t('navigation.say.rerouting'));
      void this.calculate(destination, 'reroute');
    } else if (
      route.provider !== 'osm' &&
      progress.remainingM > 3000 &&
      now - this.lastFasterCheck > FASTER_CHECK_MS
    ) {
      this.lastFasterCheck = now;
      void this.checkFaster(route, destination, position, progress.remainingS);
    }
  }

  private async checkFaster(
    current: Route,
    destination: Place,
    from: Coordinate,
    remainingS: number,
  ): Promise<void> {
    try {
      const route = await this.service(current.provider).route(from, destination.coordinate);
      if (this._route() !== current) return;
      const minutes = Math.round((remainingS - route.durationS) / 60);
      const faster = route.durationS < remainingS - FASTER_GAIN_S;
      // Also without a detour: traffic and arrival time are up to date again.
      this.adopt(route, destination);
      if (faster) {
        this.say(this.t('navigation.say.faster', { minutes }));
      } else if (route.delayS > DELAY_WARNING_S && !this.delayWarned) {
        this.delayWarned = true;
        this.say(
          this.t('navigation.say.traffic_ahead', { minutes: Math.round(route.delayS / 60) }),
        );
      }
    } catch (error) {
      this.noteFailure(error);
    }
  }

  private async prepareDemo(): Promise<void> {
    const active = this._route();
    if (active) return this.positions.driveDemoAlong(active.line);
    // Drive on from where the car is, or from a fixed place if it is unknown.
    const here = this.positions.position()?.coordinate;
    const from = here ?? DEMO_START;
    const to: Coordinate = here ? [here[0] + 0.012, here[1] - 0.01] : DEMO_END;
    const line = await this.osm
      .route(from, to)
      .then((route) => route.line)
      .catch(() => polyline([from, to]));
    if (this.positions.isDemo() && !this._route()) this.positions.driveDemoAlong(line);
  }

  private announcementText(step: RouteStep, { immediate, spokenM }: Announcement): string {
    const arriving = step.maneuver.type === 'arrive';
    if (arriving && immediate) return this.t('navigation.say.arriving');
    const distance = this.spokenDistance(spokenM);
    if (arriving) return this.t('navigation.say.arriving_in', { distance });
    const instruction = this.instruction(step);
    return immediate
      ? instruction
      : this.t('navigation.say.in_distance', {
          distance,
          instruction: instruction.charAt(0).toLowerCase() + instruction.slice(1),
        });
  }

  /** A natural voice fetches the next sentences, for speaking at once and in dead spots. */
  private prepareVoice(route: Route, progress: Progress): void {
    const { navigation, rate, provider } = this.settings().voice;
    const { lang } = this.translate;
    const now = [progress.stepIndex, navigation, rate, provider, lang].join('|');
    if (route === this.prepared.route && now === this.prepared.for) return;
    this.prepared = { route, for: now };
    if (!navigation) return this.speech.prepare([], lang, rate);
    const texts = announcementsAhead(route, progress, PREPARED_MANOEUVRES).map((one) =>
      this.announcementText(one.step, one),
    );
    this.speech.prepare([...texts, this.t('navigation.say.rerouting')], lang, rate);
  }

  private sayStart(route: Route, place: Place): void {
    let text = this.t('navigation.say.start', {
      place: place.name,
      duration: formatDuration(route.durationS),
    });
    if (route.delayS > 120) {
      text += ' ' + this.t('navigation.say.delay', { minutes: Math.round(route.delayS / 60) });
    }
    this.say(text);
  }

  private spokenDistance(metres: number): string {
    return metres < 1000 && this.units().distance === 'km'
      ? this.t('navigation.say.metres', { n: Math.max(10, Math.round(metres / 50) * 50) })
      : formatDistanceIn(metres, this.units());
  }

  private say(text: string): void {
    const voice = this.settings().voice;
    if (voice.navigation) void this.speech.speak(text, this.translate.lang, voice.rate);
  }

  private noteFailure(error: unknown): void {
    if (error instanceof KeyRejectedError) this.reject(error.providerId);
    if (error instanceof QuotaExhaustedError) this.pause(error.providerId as ProviderId);
  }

  private service(id: ProviderId): NavigationService {
    return { mapbox: this.mapbox, google: this.google, osm: this.osm }[id];
  }

  private reject(id: ProviderId): void {
    if (id === 'osm') return;
    const key = this.settings().keys[id];
    this.rejected.update((rejected) => ({ ...rejected, [id]: key }));
  }

  private pause(id: ProviderId): void {
    this.paused.update((paused) => new Set(paused).add(id));
    const now = new Date();
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    this.chain.restoreExhausted({ [id]: day });
    void this.repository.saveExhausted(this.chain.exhaustedEntries()).catch(() => undefined);
  }

  private show(key: string): void {
    this._notice.set('navigation.notice.' + key);
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this._notice.set(''), 5000);
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.translate(key, params) ?? key;
  }
}
