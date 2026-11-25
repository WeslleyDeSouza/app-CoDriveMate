import {
  Injectable,
  InjectionToken,
  Injector,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { SpeechOutput } from '@core/device';
import { TranslateService } from '@core/i18n';
import { UnitsStore } from '@core/units';
import { formatDistanceIn } from '@shared/kernel/units';
import { SettingsStore } from '@domains/settings';
import { OfflineSaver } from '../domain/offline';
import { Route } from '../domain/route';
import { WeatherPoint, WeatherSource, weatherAt, weatherPlaces } from '../domain/weather';
import { NavigationStore } from './navigation.store';

export const OFFLINE_SAVERS = new InjectionToken<OfflineSaver[]>('OFFLINE_SAVERS');

export type OfflineState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving'; readonly share: number }
  | { readonly kind: 'done' }
  | { readonly kind: 'incomplete' };

const WEATHER_MAX_AGE_MS = 30 * 60_000;
const CHECK_MS = 60_000;

/** What belongs to a route besides guidance: weather on the way, saving it for offline use. */
@Injectable({ providedIn: 'root' })
export class RouteExtrasStore {
  private readonly navigation = inject(NavigationStore);
  private readonly weatherSource = inject(WeatherSource);
  private readonly injector = inject(Injector);
  private readonly speech = inject(SpeechOutput);
  private readonly translate = inject(TranslateService);
  private readonly settings = inject(SettingsStore).settings;
  private readonly units = inject(UnitsStore).units;

  private readonly _weather = signal<readonly WeatherPoint[]>([]);
  private readonly _offline = signal<OfflineState>({ kind: 'idle' });
  private weatherAge = 0;
  private job = 0;

  readonly weather = this._weather.asReadonly();
  readonly offline = this._offline.asReadonly();
  /** The worst weather on the way and where it begins. */
  readonly worst = computed(() =>
    this._weather().reduce<WeatherPoint | null>(
      (worst, point) => (!worst || point.level > worst.level ? point : worst),
      null,
    ),
  );

  constructor() {
    // A new destination, not every recalculation on the way there.
    effect((onCleanup) => {
      const destination = this.navigation.destination();
      this.job++;
      this._offline.set({ kind: 'idle' });
      this._weather.set([]);
      if (!destination) return;
      let warned = false;
      let cancelled = false;
      const load = async () => {
        const route = this.navigation.route();
        if (!route || Date.now() - this.weatherAge < WEATHER_MAX_AGE_MS) return;
        this.weatherAge = Date.now();
        const points = await this.forecast(route);
        if (cancelled || !points) return;
        this._weather.set(points);
        const danger = points.find((point) => point.level >= 2);
        if (danger && !warned) {
          warned = true;
          this.warn(danger);
        }
      };
      this.weatherAge = 0;
      untracked(() => void load());
      const timer = setInterval(() => void load(), CHECK_MS);
      onCleanup(() => {
        cancelled = true;
        clearInterval(timer);
      });
    });
  }

  async saveOffline(): Promise<void> {
    const route = this.navigation.route();
    // Google does not allow to keep anything that comes from its route.
    if (!route || route.provider === 'google' || this._offline().kind === 'saving') return;
    const job = ++this.job;
    const savers = (this.injector.get(OFFLINE_SAVERS, null, { optional: true }) ?? []).flat();
    const shares = savers.map(() => 0);
    const cancelled = () => job !== this.job;
    this._offline.set({ kind: 'saving', share: 0 });
    const results = await Promise.all(
      savers.map((saver, i) =>
        saver
          .save(route.line.points, {
            cancelled,
            progress: (share) => {
              shares[i] = share;
              if (cancelled()) return;
              const average = shares.reduce((sum, s) => sum + s, 0) / shares.length;
              // Whole percents only, so the view is not redrawn for every tile.
              this._offline.set({ kind: 'saving', share: Math.floor(average * 100) / 100 });
            },
          })
          .then((complete) => {
            shares[i] = 1;
            return complete;
          })
          .catch((error: unknown) => {
            console.warn('Saving for offline use failed', error);
            return false;
          }),
      ),
    );
    if (cancelled()) return;
    this._offline.set({ kind: results.every(Boolean) ? 'done' : 'incomplete' });
  }

  private async forecast(route: Route): Promise<WeatherPoint[] | null> {
    const places = weatherPlaces(route.line);
    try {
      const forecasts = await this.weatherSource.hourly(places.map((place) => place.at));
      const now = Date.now();
      return places.flatMap(({ alongM }, i) => {
        const forecast = forecasts[i];
        const arrival = now + (route.durationS * 1000 * alongM) / (route.line.lengthM || 1);
        const point = forecast && weatherAt(forecast, alongM, arrival);
        return point ? [point] : [];
      });
    } catch {
      // Try again with the next check after five minutes.
      this.weatherAge = Date.now() - WEATHER_MAX_AGE_MS + 5 * 60_000;
      return null;
    }
  }

  private warn(point: WeatherPoint): void {
    const voice = this.settings().voice;
    if (!voice.infos) return;
    const text = this.translate.translate('navigation.say.weather', {
      weather: this.translate.translate('navigation.weather.' + point.kind) ?? '',
      distance: formatDistanceIn(point.alongM, this.units()),
    });
    if (text) void this.speech.speak(text, this.translate.lang, voice.rate);
  }
}
