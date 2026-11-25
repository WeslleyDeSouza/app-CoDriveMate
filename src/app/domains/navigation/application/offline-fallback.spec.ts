import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '@core/i18n/testing';
import { AppSettings, DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { telemetryTesting } from '@domains/telemetry/testing';
import { Coordinate, polyline } from '../domain/geo';
import { Route } from '../domain/route';
import { navigationTesting } from '../testing';
import { NavigationStore } from './navigation.store';
import { PositionStore } from './position.store';

const A: Coordinate = [8.54, 47.37];
const B: Coordinate = [8.54, 47.38];
const PLACE = { name: 'Ziel', detail: '', coordinate: B };

const line = polyline([A, B]);
const step = (type: string, alongM: number) => ({
  maneuver: { type, modifier: '', exit: null },
  street: '',
  alongM,
});
const ROUTE: Route = {
  provider: 'osm',
  line,
  durationS: 120,
  delayS: 0,
  steps: [step('depart', 0), step('arrive', line.lengthM)],
  congestion: [],
};

describe('NavigationStore without a connection', () => {
  let nav: ReturnType<typeof navigationTesting>;
  let store: NavigationStore;

  beforeEach(async () => {
    nav = navigationTesting();
    nav.gps.allowed = true;
    const settings = {
      ...DEFAULT_SETTINGS,
      keys: { ...DEFAULT_SETTINGS.keys, mapbox: 'pk.test' },
    };
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        ...telemetryTesting().providers,
        ...nav.providers,
        { provide: SettingsStore, useValue: { settings: signal<AppSettings>(settings) } },
      ],
    });
    store = TestBed.inject(NavigationStore);
    await TestBed.inject(PositionStore).start(false);
    nav.gps.emit(A, 0);
  });

  it('calculates on the device when no service answers, on the OSM map', async () => {
    nav.mapbox.nextRoute = new Error('offline');
    nav.osm.nextRoute = new Error('offline');
    nav.offline.nextRoute = ROUTE;
    expect(store.mapKind()).not.toBe('ofm');
    expect(await store.navigateTo(PLACE)).toBe(true);
    expect(store.route()).toBe(ROUTE);
    expect(store.mapKind()).toBe('ofm');
    expect(store.notice()).toBe('navigation.notice.offline_route');
  });

  it('is not asked while a service answers', async () => {
    nav.mapbox.nextRoute = new Error('offline');
    nav.osm.nextRoute = ROUTE;
    nav.offline.nextRoute = ROUTE;
    expect(await store.navigateTo(PLACE)).toBe(true);
    expect(nav.offline.routes).toBe(0);
    expect(store.notice()).toBe('navigation.notice.provider_switched');
  });

  it('says that there is no route if the stored map has none either', async () => {
    expect(await store.navigateTo(PLACE)).toBe(false);
    expect(nav.offline.routes).toBe(1);
    expect(store.notice()).toBe('navigation.notice.no_route');
  });
});
