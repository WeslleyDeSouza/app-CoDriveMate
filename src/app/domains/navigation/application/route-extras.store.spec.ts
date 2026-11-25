import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '@core/i18n/testing';
import { AppSettings, DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { telemetryTesting } from '@domains/telemetry/testing';
import { Coordinate, fitPoints, polyline } from '../domain/geo';
import { OfflineSaveJob, OfflineSaver } from '../domain/offline';
import { drivingWeather, weatherAt, weatherPlaces } from '../domain/weather';
import { navigationTesting } from '../testing';
import { NavigationStore } from './navigation.store';
import { PositionStore } from './position.store';
import { OFFLINE_SAVERS, RouteExtrasStore } from './route-extras.store';

const A: Coordinate = [8.54, 47.37];
const B: Coordinate = [8.54, 47.38];

class FakeSaver extends OfflineSaver {
  job?: OfflineSaveJob;
  finish: (complete: boolean) => void = () => undefined;
  save(_points: readonly Coordinate[], job: OfflineSaveJob): Promise<boolean> {
    this.job = job;
    return new Promise((resolve) => (this.finish = resolve));
  }
}

describe('weather rules', () => {
  it('rates what matters for driving', () => {
    expect(drivingWeather(95, 20, 5, 0)).toEqual({ kind: 'storm', level: 3 });
    expect(drivingWeather(73, -2, 1, 1)).toEqual({ kind: 'snow', level: 2 });
    expect(drivingWeather(61, 0.5, 1, 0)).toEqual({ kind: 'ice', level: 2 });
    expect(drivingWeather(61, 9, 1, 0)).toEqual({ kind: 'rain', level: 1 });
    expect(drivingWeather(45, 5, 0, 0)).toEqual({ kind: 'fog', level: 1 });
    expect(drivingWeather(0, 0, 0, 0)).toEqual({ kind: 'frost', level: 1 });
    expect(drivingWeather(1, 12, 0, 0)).toEqual({ kind: 'dry', level: 0 });
  });

  it('asks at both ends and not too often in between', () => {
    expect(weatherPlaces(polyline([A, B])).map((p) => p.at)).toEqual([A, B]);
    expect(weatherPlaces(polyline([A, [12, 52]]))).toHaveLength(12);
  });

  it('takes the hour of arrival', () => {
    const forecast = {
      time: [0, 3600, 7200],
      temperature: [1, 12, 20],
      precipitation: [0, 0, 0],
      snowfall: [0, 0, 0],
      code: [0, 0, 0],
    };
    expect(weatherAt(forecast, 0, 4000_000)?.temperature).toBe(12);
    expect(weatherAt({ ...forecast, time: [] }, 0, 0)).toBeNull();
  });
});

describe('fitPoints', () => {
  it('zooms out for longer routes', () => {
    const near = fitPoints([A, B], 800, 600);
    const far = fitPoints([A, [7.44, 46.95]], 800, 600);
    expect(near.center[1]).toBeCloseTo(47.375, 4);
    expect(near.zoom).toBeGreaterThan(far.zoom);
    expect(fitPoints([A], 800, 600).zoom).toBe(17);
  });
});

describe('RouteExtrasStore', () => {
  let nav: ReturnType<typeof navigationTesting>;
  let extras: RouteExtrasStore;
  let navigation: NavigationStore;
  let savers: FakeSaver[];

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      TestBed.tick();
      await new Promise((resolve) => setTimeout(resolve));
    }
  }

  async function start(code: number, temperature: number): Promise<void> {
    nav = navigationTesting();
    savers = [new FakeSaver(), new FakeSaver()];
    const line = polyline([A, B]);
    const step = (type: string, alongM: number) => ({
      maneuver: { type, modifier: '', exit: null },
      street: '',
      alongM,
    });
    nav.osm.nextRoute = {
      provider: 'osm',
      line,
      durationS: 120,
      delayS: 0,
      steps: [step('depart', 0), step('arrive', line.lengthM)],
      congestion: [],
    };
    nav.weather.forecast = {
      time: [Date.now() / 1000],
      temperature: [temperature],
      precipitation: [0],
      snowfall: [0],
      code: [code],
    };
    nav.gps.allowed = true;
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        ...telemetryTesting().providers,
        ...nav.providers,
        ...savers.map((useValue) => ({ provide: OFFLINE_SAVERS, useValue, multi: true })),
        { provide: SettingsStore, useValue: { settings: signal<AppSettings>(DEFAULT_SETTINGS) } },
      ],
    });
    navigation = TestBed.inject(NavigationStore);
    extras = TestBed.inject(RouteExtrasStore);
    await TestBed.inject(PositionStore).start(false);
    nav.gps.emit(A, 0);
    await navigation.navigateTo({ name: 'Ziel', detail: '', coordinate: B });
    await settle();
  }

  it('shows the weather and warns once about danger', async () => {
    await start(73, -1);
    expect(extras.worst()).toMatchObject({ kind: 'snow', level: 2 });
    expect(nav.speech.said.filter((text) => text === 'navigation.say.weather')).toHaveLength(1);
  });

  it('does not talk about good weather and forgets it with the route', async () => {
    await start(0, 15);
    expect(extras.worst()?.kind).toBe('dry');
    expect(nav.speech.said).not.toContain('navigation.say.weather');

    navigation.stop();
    await settle();
    expect(extras.weather()).toEqual([]);
  });

  it('reports the progress of all savers together', async () => {
    await start(0, 15);
    const saving = extras.saveOffline();
    savers[0].job?.progress(0.5);
    expect(extras.offline()).toEqual({ kind: 'saving', share: 0.25 });
    savers.forEach((saver) => saver.finish(true));
    await saving;
    expect(extras.offline()).toEqual({ kind: 'done' });
  });

  it('says when something is missing', async () => {
    await start(0, 15);
    const saving = extras.saveOffline();
    savers[0].finish(true);
    savers[1].finish(false);
    await saving;
    expect(extras.offline()).toEqual({ kind: 'incomplete' });
  });

  it('cancels saving when the route ends', async () => {
    await start(0, 15);
    const saving = extras.saveOffline();
    navigation.stop();
    await settle();
    expect(savers[0].job?.cancelled()).toBe(true);
    savers.forEach((saver) => saver.finish(true));
    await saving;
    expect(extras.offline()).toEqual({ kind: 'idle' });
  });
});
