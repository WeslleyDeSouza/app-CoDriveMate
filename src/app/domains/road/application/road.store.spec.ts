import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '@core/i18n/testing';
import { MapPinsStore, PositionStore } from '@domains/navigation';
import { navigationTesting } from '@domains/navigation/testing';
import { AppSettings, DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { telemetryTesting } from '@domains/telemetry/testing';
import { roadTesting } from '../testing';
import { RoadStore } from './road.store';

describe('RoadStore', () => {
  let nav: ReturnType<typeof navigationTesting>;
  let fakes: ReturnType<typeof roadTesting>;
  let store: RoadStore;
  const settings = signal<AppSettings>(DEFAULT_SETTINGS);

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 24, 10));
    nav = navigationTesting();
    fakes = roadTesting();
    nav.gps.allowed = true;
    settings.set(DEFAULT_SETTINGS);
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        ...telemetryTesting().providers,
        ...nav.providers,
        ...fakes.providers,
        { provide: SettingsStore, useValue: { settings } },
      ],
    });
    await TestBed.inject(PositionStore).start(false);
    store = TestBed.inject(RoadStore);
    store.start();
  });
  afterEach(() => vi.useRealTimers());

  const drive = async () => {
    nav.gps.emit([8.54, 47.38], 0, 50);
    await vi.advanceTimersByTimeAsync(2500);
  };

  it('shows the limit and says a hazard once', async () => {
    fakes.road.data = {
      roads: [
        {
          kmh: 50,
          points: [
            [8.54, 47.378],
            [8.54, 47.385],
          ],
        },
      ],
      hazards: [{ id: 'n1', kind: 'level_crossing', at: [8.54, 47.382] }],
    };
    await drive();
    expect(store.limitKmh()).toBe(50);
    expect(store.hazard()?.hazard.id).toBe('n1');
    await drive();
    expect(nav.speech.said).toEqual(['road.say.hazard']);
    // Where the car is and the cell ahead, each once.
    expect(new Set(fakes.road.asked.map(String)).size).toBe(fakes.road.asked.length);
    expect(fakes.road.asked.length).toBeLessThanOrEqual(2);
  });

  it('says nothing when hints are off', async () => {
    settings.update((s) => ({ ...s, hazardHints: false }));
    fakes.road.data = { roads: [], hazards: [{ id: 'n1', kind: 'curve', at: [8.54, 47.382] }] };
    await drive();
    expect(store.hazard()).toBeNull();
    expect(nav.speech.said).toEqual([]);
  });

  it('asks for traffic only with a key, and not all the time', async () => {
    await drive();
    expect(fakes.traffic.asked).toBe(0);
    settings.update((s) => ({ ...s, keys: { ...s.keys, tomtom: 'k' } }));
    fakes.traffic.incidents = [
      { id: 'a', kind: 'accident', at: [8.54, 47.39], text: 'Unfall', magnitude: 0 },
    ];
    await drive();
    await drive();
    expect(fakes.traffic.asked).toBe(1);
    expect(nav.speech.said).toEqual(['road.say.traffic']);
    expect(TestBed.inject(MapPinsStore).pins()).toHaveLength(1);
  });
});
