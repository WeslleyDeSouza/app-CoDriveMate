import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '@core/i18n/testing';
import { DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { telemetryTesting } from '@domains/telemetry/testing';
import { findHook, hook, hooks, textOf } from '@shared/testing';
import { NavigationStore } from '../application/navigation.store';
import { PlacesStore } from '../application/places.store';
import { Place } from '../domain/route';
import {
  NO_PLACES,
  matching,
  offlineCoordinate,
  toSaved,
  withRecent,
} from '../domain/saved-places';
import { navigationTesting } from '../testing';
import { SearchPanel } from './search-panel';

const BERN: Place = { name: 'Bern', detail: 'Schweiz', coordinate: [7.45, 46.95], source: 'osm' };

describe('saved places', () => {
  it('keeps no coordinates of Mapbox', () => {
    expect(toSaved(BERN).coordinate).toEqual([7.45, 46.95]);
    expect(toSaved({ ...BERN, source: 'mapbox' }).coordinate).toBeNull();
  });

  it('takes the place of OpenStreetMap only if it is the same one', () => {
    const near: Place = { ...BERN, coordinate: [7.4505, 46.95] };
    const far: Place = { ...BERN, coordinate: [7.5, 46.95] };
    expect(offlineCoordinate(BERN, [far, near])).toEqual(near.coordinate);
    expect(offlineCoordinate(BERN, [far])).toBeUndefined();
  });

  it('finds saved places by their words, each once', () => {
    const places = { ...NO_PLACES, home: toSaved(BERN), recent: [toSaved(BERN)] };
    expect(matching(places, 'schw ber')).toHaveLength(1);
    expect(matching(places, 'Basel')).toEqual([]);
    expect(matching(places, ' ')).toEqual([]);
  });

  it('lists every place once, newest first, and not endlessly', () => {
    let places = NO_PLACES;
    for (let i = 0; i < 12; i++) {
      places = withRecent(places, { name: 'P' + i, detail: '', coordinate: [8 + i, 47] });
    }
    places = withRecent(places, { name: 'P8', detail: '', coordinate: [16, 47] });
    expect(places.recent).toHaveLength(8);
    expect(places.recent[0].name).toBe('P8');
    expect(places.recent.filter(({ name }) => name === 'P8')).toHaveLength(1);
  });
});

describe('SearchPanel', () => {
  let fixture: ComponentFixture<SearchPanel>;
  let root: HTMLElement;
  let nav: ReturnType<typeof navigationTesting>;
  let go: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    nav = navigationTesting();
    nav.osm.places = [BERN];
    nav.repository.places = { ...NO_PLACES, recent: [{ ...toSaved(BERN), name: 'Thun' }] };
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        ...telemetryTesting().providers,
        ...nav.providers,
        { provide: SettingsStore, useValue: { settings: signal(DEFAULT_SETTINGS) } },
      ],
    });
    go = vi.spyOn(TestBed.inject(NavigationStore), 'navigateTo').mockResolvedValue(true);
    fixture = TestBed.createComponent(SearchPanel);
    root = fixture.nativeElement;
    await settle();
  });

  async function settle(ms = 0): Promise<void> {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));
    }
    fixture.detectChanges();
  }

  const input = () => hook<HTMLInputElement>(root, 'map-search');
  async function type(text: string): Promise<void> {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    await settle(500);
  }
  async function press(name: string): Promise<void> {
    hook(root, name).click();
    await settle();
  }
  async function open(): Promise<void> {
    input().dispatchEvent(new Event('focus'));
    await settle();
  }

  it('suggests while typing, but not for two letters', async () => {
    await type('Be');
    expect(nav.osm.suggested).toBe(0);
    await type('Ber');
    expect(nav.osm.suggested).toBe(1);
    expect(textOf(hook(root, 'map-result-0'))).toContain('Bern');
  });

  it('remembers where the user went', async () => {
    await type('Bern');
    await press('map-result-0');
    expect(go).toHaveBeenCalledWith(BERN);
    expect(nav.repository.places.recent.map(({ name }) => name)).toContain('Bern');
    expect(hooks(root, 'map-result-')).toHaveLength(0);
  });

  it('goes to and forgets a last destination', async () => {
    await open();
    await press('map-recent-0');
    expect(go).toHaveBeenCalledWith(expect.objectContaining({ name: 'Thun' }));
    await open();
    await press('map-recent-remove-0');
    expect(nav.repository.places.recent).toEqual([]);
  });

  it('asks where home is, then goes there', async () => {
    await open();
    await press('map-favourite-home');
    expect(findHook(root, 'map-assign')).not.toBeNull();
    await type('Bern');
    await press('map-result-0');
    expect(go).not.toHaveBeenCalled();
    expect(nav.repository.places.home?.name).toBe('Bern');

    await press('map-favourite-home');
    expect(go).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bern' }));
  });

  it('looks up a place of Mapbox again', async () => {
    nav.repository.places.recent[0] satisfies object;
    await open();
    await press('map-favourite-work');
    nav.osm.places = [{ ...BERN, source: 'mapbox' }];
    await type('Bern');
    await press('map-result-0');
    expect(nav.repository.places.work?.coordinate).toBeNull();
    await press('map-favourite-work');
    expect(go).toHaveBeenCalledWith(expect.objectContaining({ coordinate: BERN.coordinate }));
  });

  it('goes to a place of Mapbox without a network', async () => {
    await open();
    await press('map-favourite-work');
    nav.osm.places = [{ ...BERN, source: 'mapbox' }];
    await type('Bern');
    await press('map-result-0');
    expect(nav.repository.places.work?.offline).toEqual(BERN.coordinate);
    nav.osm.places = new Error('offline');
    await press('map-favourite-work');
    expect(go).toHaveBeenCalledWith(expect.objectContaining({ coordinate: BERN.coordinate }));
  });

  it('offers saved places while typing and says when one cannot be found', async () => {
    nav.osm.places = new Error('offline');
    const places = TestBed.inject(PlacesStore);
    await places.setFavourite('home', { ...BERN, name: 'Chalet', source: 'mapbox' });
    await open();
    await type('chal');
    await press('map-match-0');
    expect(go).not.toHaveBeenCalled();
    expect(textOf(hook(root, 'map-search-state'))).toContain('unknown');
  });

  it('searches for what was said', async () => {
    nav.microphone.heard = 'Bern';
    await press('map-search-speak');
    expect(input().value).toBe('Bern');
    expect(hooks(root, 'map-result-')).toHaveLength(1);
  });
});
