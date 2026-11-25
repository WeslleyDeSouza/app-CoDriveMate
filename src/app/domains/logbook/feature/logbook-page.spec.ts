import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { MapPinsStore } from '@domains/navigation';
import { navigationTesting } from '@domains/navigation/testing';
import { scene3dTesting } from '@domains/scene3d/testing';
import { DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { TelemetryStore } from '@domains/telemetry';
import { telemetryTesting } from '@domains/telemetry/testing';
import { findHook, hook, hooks, textOf } from '@shared/testing';
import { LogbookStore } from '../application/logbook.store';
import { Trip } from '../domain/trip';
import { logbookTesting } from '../testing';
import { LogbookPage } from './logbook-page';

const november = (day: number) => new Date(2026, 10, day, 8).getTime();
const trip = (id: number, change: Partial<Trip> = {}): Trip => ({
  id,
  startedAt: id,
  endedAt: id + 600_000,
  distanceKm: 10,
  fuelL: 0.8,
  maxSpeedKmh: 80,
  from: '',
  to: '',
  source: 'obd',
  fuelPrice: 1.85,
  cost: 1.48,
  score: 90,
  driving: { hardAccelerations: 0, hardBrakings: 0, highRpmSeconds: 0, idleSeconds: 0 },
  path: [],
  end: null,
  ...change,
});

describe('logbook', () => {
  let fixture: ComponentFixture<LogbookPage>;
  let root: HTMLElement;
  let car: ReturnType<typeof telemetryTesting>;
  let book: ReturnType<typeof logbookTesting>;

  function provide(trips: Trip[]): void {
    car = telemetryTesting();
    book = logbookTesting();
    book.repository.trips = trips;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        ...car.providers,
        ...navigationTesting().providers,
        ...scene3dTesting().providers,
        ...book.providers,
        { provide: SettingsStore, useValue: { settings: signal(DEFAULT_SETTINGS) } },
      ],
    });
  }

  async function setup(trips: Trip[]): Promise<void> {
    provide(trips);
    fixture = TestBed.createComponent(LogbookPage);
    root = fixture.nativeElement;
    await settle();
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));
    }
    fixture.detectChanges();
  }

  it('shows the empty state when no trip was recorded', async () => {
    await setup([]);
    expect(textOf(hook(root, 'logbook-empty'))).toBe('logbook.empty');
    expect(findHook(root, 'logbook-count')).toBeNull();
  });

  it('shows the newest month first, with its sum', async () => {
    const october = new Date(2026, 9, 3).getTime();
    await setup([trip(october), trip(november(1)), trip(november(5), { distanceKm: 30, cost: 4 })]);
    expect(textOf(hook(root, 'logbook-count'))).toBe('2');
    expect(textOf(hook(root, 'logbook-distance'))).toBe('40 km');
    expect(textOf(hook(root, 'logbook-cost'))).toBe('5.48');
    expect(hooks(root, 'logbook-trip-').map((row) => row.dataset['sectionTest'])).toEqual([
      'logbook-trip-' + november(5),
      'logbook-trip-' + november(1),
    ]);

    hook(root, 'logbook-month-2026-10').click();
    await settle();
    expect(textOf(hook(root, 'logbook-count'))).toBe('1');
  });

  it('deletes only after the second tap', async () => {
    const id = november(1);
    await setup([trip(id)]);
    hook(root, 'logbook-delete-' + id).click();
    await settle();
    expect(book.repository.trips).toHaveLength(1);
    hook(root, 'logbook-delete-' + id).click();
    await settle();
    expect(book.repository.trips).toHaveLength(0);
  });

  it('shows a drive on the map, if there are positions', async () => {
    const id = november(1);
    const path = [
      [8.5, 47.3],
      [8.6, 47.4],
    ] as [number, number][];
    await setup([trip(id, { path }), trip(id + 1)]);
    expect(findHook(root, 'logbook-map-' + (id + 1))).toBeNull();
    hook(root, 'logbook-map-' + id).click();
    expect(TestBed.inject(MapPinsStore).track()).toEqual(path);
  });

  it('records a drive by itself, but keeps no demo', async () => {
    vi.useFakeTimers();
    try {
      provide([]);
      const store = TestBed.inject(LogbookStore);
      const telemetry = TestBed.inject(TelemetryStore);
      store.start();
      for (const [source, start] of [
        [car.demo, () => telemetry.startDemo()],
        [car.obd, () => telemetry.connectObd()],
      ] as const) {
        await start();
        source.emit({ speed: 60, rpm: 2000 });
        await vi.advanceTimersByTimeAsync(60_000);
        expect(store.current()?.distanceKm).toBeCloseTo(1, 1);
        source.emit({ speed: 0, rpm: 0 });
        await vi.advanceTimersByTimeAsync(250_000);
        expect(store.current()).toBeNull();
      }
      expect(book.repository.trips).toHaveLength(1);
      expect(book.repository.trips[0].source).toBe('obd');
    } finally {
      vi.useRealTimers();
    }
  });
});
