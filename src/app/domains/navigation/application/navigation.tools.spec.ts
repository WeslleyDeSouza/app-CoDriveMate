import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '@core/i18n/testing';
import { DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { telemetryTesting } from '@domains/telemetry/testing';
import { Place } from '../domain/route';
import { navigationTesting } from '../testing';
import { planTripTool } from './navigation.tools';

const POOL: Place = {
  name: 'Hallenbad Oerlikon',
  detail: 'Zürich',
  coordinate: [8.55, 47.41],
  source: 'osm',
};

describe('plan_trip tool', () => {
  let nav: ReturnType<typeof navigationTesting>;
  const tool = () => TestBed.runInInjectionContext(planTripTool);

  beforeEach(() => {
    nav = navigationTesting();
    nav.osm.places = [POOL];
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        ...telemetryTesting().providers,
        ...nav.providers,
        { provide: SettingsStore, useValue: { settings: signal(DEFAULT_SETTINGS) } },
      ],
    });
  });

  it('saves the place with topic and day after a yes, without starting a route', async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const result = await tool().run(
      { query: 'Hallenbad', topic: 'Schwimmen', note: 'Badetuch', days_from_today: 0 },
      { confirm },
    );
    expect(confirm).toHaveBeenCalledOnce();
    const [trip] = nav.repository.trips;
    expect(trip).toEqual(
      expect.objectContaining({ topic: 'Schwimmen', note: 'Badetuch', favourite: false }),
    );
    expect(trip.place.name).toBe('Hallenbad Oerlikon');
    expect(trip.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toContain('Saved Hallenbad Oerlikon');
    expect(result).not.toMatch(/8\.55|47\.41/);
    expect(nav.osm.routes).toBe(0);
  });

  it('saves nothing without a yes, or without a place', async () => {
    const no = { confirm: vi.fn().mockResolvedValue(false) };
    expect(await tool().run({ query: 'Hallenbad', weekday: 'saturday' }, no)).toContain(
      'did not want',
    );
    nav.osm.places = [];
    expect(await tool().run({ query: 'Nirgends' }, no)).toContain('Nothing found');
    expect(nav.repository.trips).toEqual([]);
  });

  it('saves for any day if no day was said', async () => {
    await tool().run(
      { query: 'Hallenbad', favourite: true },
      { confirm: vi.fn().mockResolvedValue(true) },
    );
    expect(nav.repository.trips[0]).toEqual(
      expect.objectContaining({ day: null, favourite: true, topic: '' }),
    );
  });
});
