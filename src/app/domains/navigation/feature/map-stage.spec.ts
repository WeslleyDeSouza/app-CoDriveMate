import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { AppSettings, DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { telemetryTesting } from '@domains/telemetry/testing';
import { QuotaExhaustedError } from '@shared/kernel/provider-chain';
import { findHook, hook, textOf } from '@shared/testing';
import { NavigationStore } from '../application/navigation.store';
import { Coordinate, polyline } from '../domain/geo';
import { KeyRejectedError, Place, ProviderId, Route } from '../domain/route';
import { navigationTesting } from '../testing';
import { MapStage } from './map-stage';

const A: Coordinate = [8.54, 47.37];
const B: Coordinate = [8.54, 47.38];
const PLACE: Place = { name: 'Bern', detail: 'Schweiz', coordinate: B };

function makeRoute(provider: ProviderId): Route {
  const line = polyline([A, B]);
  const step = (type: string, alongM: number) => ({
    maneuver: { type, modifier: '', exit: null },
    street: '',
    alongM,
  });
  return {
    provider,
    line,
    durationS: 120,
    delayS: 0,
    steps: [step('depart', 0), step('arrive', line.lengthM)],
    congestion: [],
  };
}

describe('MapStage', () => {
  let fixture: ComponentFixture<MapStage>;
  let root: HTMLElement;
  let nav: ReturnType<typeof navigationTesting>;
  let store: NavigationStore;

  async function setup(token = ''): Promise<void> {
    nav = navigationTesting();
    nav.osm.nextRoute = makeRoute('osm');
    nav.mapbox.nextRoute = makeRoute('mapbox');
    nav.osm.places = nav.mapbox.places = [PLACE];
    nav.gps.allowed = true;
    const settings = signal<AppSettings>({
      ...DEFAULT_SETTINGS,
      keys: { ...DEFAULT_SETTINGS.keys, mapbox: token },
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        ...telemetryTesting().providers,
        ...nav.providers,
        { provide: SettingsStore, useValue: { settings, update: vi.fn() } },
      ],
    });
    store = TestBed.inject(NavigationStore);
    fixture = TestBed.createComponent(MapStage);
    root = fixture.nativeElement;
    await settle();
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));
    }
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function startRoute(): Promise<void> {
    nav.gps.emit(A, 0);
    await settle();
    hook<HTMLInputElement>(root, 'map-search').value = 'Bern';
    hook(root, 'map-search-submit').click();
    await settle();
    hook(root, 'map-result-0').click();
    await settle();
  }

  const kind = () => nav.maps.current.options.kind;

  it('shows OpenFreeMap without a Mapbox token', async () => {
    await setup();
    expect(kind()).toBe('ofm');
    expect(findHook(root, 'map-traffic')).toBeNull();
  });

  it('shows Mapbox with its token and traffic when one is set', async () => {
    await setup('pk.test');
    expect(nav.maps.current.options).toMatchObject({ kind: 'mapbox', token: 'pk.test' });
    expect(nav.maps.current.layers).toContain('cdm-traffic');
    expect(findHook(root, 'map-traffic')).not.toBeNull();
  });

  it('searches, calculates a route and guides to it', async () => {
    await setup('pk.test');
    await startRoute();

    expect(nav.mapbox.routes).toBe(1);
    expect(nav.osm.routes).toBe(0);
    expect(textOf(hook(root, 'map-eta-provider'))).toBe('Mapbox');
    expect(findHook(root, 'map-guidance')).not.toBeNull();
    expect(findHook(root, 'map-search')).toBeNull();
    expect(nav.speech.said[0]).toContain('navigation.say.start');

    hook(root, 'map-stop').click();
    await settle();
    expect(findHook(root, 'map-eta')).toBeNull();
    expect(findHook(root, 'map-search')).not.toBeNull();
  });

  it('announces the arrival and ends the guidance', async () => {
    await setup();
    await startRoute();
    nav.gps.emit(B, 0);
    await settle();

    expect(nav.speech.said).toContain('navigation.say.arrived');
    expect(store.route()).toBeNull();
  });

  it('changes map and route together when the Mapbox quota is used up', async () => {
    await setup('pk.test');
    nav.mapbox.nextRoute = new QuotaExhaustedError('mapbox');
    await startRoute();

    expect(store.route()?.provider).toBe('osm');
    expect(kind()).toBe('ofm');
    expect(Object.keys(nav.repository.exhausted)).toEqual(['mapbox']);
    expect(findHook(root, 'map-notice')).not.toBeNull();

    store.stop();
    await settle();
    expect(kind()).toBe('ofm');
  });

  it('never draws an OSM route on a Mapbox map after a passing failure', async () => {
    await setup('pk.test');
    nav.mapbox.nextRoute = new Error('offline');
    await startRoute();
    expect(kind()).toBe('ofm');

    store.stop();
    await settle();
    expect(kind()).toBe('mapbox');
  });

  it('falls back to OpenFreeMap when the map refuses the token', async () => {
    nav = navigationTesting();
    await setup('pk.bad');
    nav.maps.current.events.onFailure(true);
    await settle();
    expect(kind()).toBe('ofm');
  });

  it('gets the route again from OSM when the Mapbox map fails on the way', async () => {
    await setup('pk.test');
    await startRoute();
    nav.maps.current.events.onFailure(true);
    await settle();
    expect(kind()).toBe('ofm');
    expect(store.route()?.provider).toBe('osm');
  });

  it('shows Google only when chosen, and changes the route with the map', async () => {
    await setup('pk.test');
    const settings = TestBed.inject(SettingsStore).settings as WritableSignal<AppSettings>;
    nav.google.nextRoute = makeRoute('google');
    await startRoute();
    expect(store.route()?.provider).toBe('mapbox');

    settings.update((s) => ({
      ...s,
      keys: { ...s.keys, google: 'AIza' },
      map: { ...s.map, baseMap: 'google' },
    }));
    await settle();
    expect(nav.maps.current.options).toMatchObject({ kind: 'google', token: 'AIza' });
    expect(store.route()?.provider).toBe('google');
    expect(findHook(root, 'map-offline')).toBeNull();

    nav.maps.current.events.onFailure(true);
    await settle();
    expect(kind()).toBe('mapbox');
    expect(store.route()?.provider).toBe('mapbox');
  });

  it('searches with OSM when Mapbox rejects the key', async () => {
    await setup('pk.bad');
    nav.mapbox.places = new KeyRejectedError('mapbox');
    expect(await store.search('Bern')).toEqual([PLACE]);
    await settle();
    expect(kind()).toBe('ofm');
  });

  it('offers a retry when no map can be shown', async () => {
    await setup();
    nav.maps.failures.set('ofm', new Error('offline'));
    nav.maps.surfaces.length = 0;
    (fixture.componentInstance as unknown as { retry(): void }).retry();
    await settle();
    expect(findHook(root, 'map-error')).not.toBeNull();

    nav.maps.failures.clear();
    hook(root, 'map-retry').click();
    await settle();
    expect(findHook(root, 'map-error')).toBeNull();
  });

  const view = () => hook(root, 'map-view').dataset['view'];
  async function changeView(): Promise<void> {
    hook(root, 'map-view').click();
    await settle();
  }

  it('follows in driving direction, with north up, or not at all', async () => {
    await setup();
    nav.gps.emit(A, 90);
    await settle();
    const surface = nav.maps.current;
    expect(view()).toBe('heading');
    expect(surface.camera()).toMatchObject({ center: A, bearing: 90 });

    await changeView();
    expect(view()).toBe('north');
    expect(surface.camera()).toMatchObject({ center: A, bearing: 0 });

    await changeView();
    expect(view()).toBe('free');
    nav.gps.emit(B, 180);
    await settle();
    expect(surface.camera()).toMatchObject({ center: A, bearing: 0 });

    await changeView();
    expect(view()).toBe('heading');
    expect(surface.camera()).toMatchObject({ center: B, bearing: 180 });
  });

  it('also turns in the flat view', async () => {
    await setup();
    nav.gps.emit(A, 90);
    await settle();
    hook(root, 'map-tilt').click();
    await settle();
    expect(nav.maps.current.camera()).toMatchObject({ bearing: 90, pitch: 0 });
  });

  it('becomes free when the user drags, but not when zooming or turning', async () => {
    await setup();
    nav.gps.emit(A, 0);
    await settle();
    const surface = nav.maps.current;
    surface.events.onUserMove('zoom', { ...surface.camera(), zoom: 14 });
    surface.events.onUserMove('rotate', { ...surface.camera(), bearing: 33 });
    await settle();
    expect(view()).toBe('heading');

    surface.events.onUserMove('pan', { ...surface.camera(), center: B });
    surface.moveTo({ ...surface.camera(), center: B });
    await settle();
    expect(view()).toBe('free');

    await changeView();
    // back at the car, with the zoom the user chose
    expect(surface.camera()).toMatchObject({ center: A, zoom: 14, bearing: 0 });
  });

  it('switches between 2D and 3D', async () => {
    await setup();
    expect(nav.maps.current.camera().pitch).toBe(55);
    hook(root, 'map-tilt').click();
    await settle();
    expect(nav.maps.current.camera().pitch).toBe(0);
    expect(nav.maps.current.buildings).toBe(false);
  });

  it('tells the driver when the position is not allowed', async () => {
    await setup();
    const other = navigationTesting();
    void other;
    nav.gps.denied = true;
    expect(await store.navigateTo(PLACE)).toBe(false);
    await settle();
    expect(findHook(root, 'map-notice')).not.toBeNull();
  });
});
