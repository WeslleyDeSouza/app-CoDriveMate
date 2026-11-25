import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { navigationTesting } from '@domains/navigation/testing';
import { scene3dTesting } from '@domains/scene3d/testing';
import { DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { TelemetryStore } from '@domains/telemetry';
import { telemetryTesting } from '@domains/telemetry/testing';
import { findHook, hook, hooks, textOf } from '@shared/testing';
import { LogbookStore } from '../application/logbook.store';
import { Trip } from '../domain/trip';
import { logbookTesting } from '../testing';
import { HistoryPage } from './history-page';

const HOUR = 3_600_000;
const trip = (id: number, change: Partial<Trip> = {}): Trip => ({
  id,
  startedAt: id,
  endedAt: id + 600_000,
  distanceKm: 10,
  fuelL: 0.8,
  maxSpeedKmh: 80,
  from: 'A',
  to: 'B',
  source: 'obd',
  fuelPrice: 1.85,
  cost: 1.48,
  score: 90,
  driving: { hardAccelerations: 0, hardBrakings: 0, highRpmSeconds: 0, idleSeconds: 0 },
  path: [],
  end: null,
  stats: { speed: { min: 0, max: 80, average: 40 } },
  ...change,
});

describe('HistoryPage', () => {
  let fixture: ComponentFixture<HistoryPage>;
  let root: HTMLElement;
  let car: ReturnType<typeof telemetryTesting>;
  let book: ReturnType<typeof logbookTesting>;
  const today = new Date().setHours(8, 0, 0, 0);

  function provide(trips: Trip[], address = ''): void {
    car = telemetryTesting();
    book = logbookTesting();
    book.repository.trips = trips;
    const queryParamMap = convertToParamMap(address ? { trip: address } : {});
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        ...car.providers,
        ...navigationTesting().providers,
        ...scene3dTesting().providers,
        ...book.providers,
        { provide: SettingsStore, useValue: { settings: signal(DEFAULT_SETTINGS) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap } } },
      ],
    });
  }

  async function open(): Promise<void> {
    fixture = TestBed.createComponent(HistoryPage);
    root = fixture.nativeElement;
    await settle();
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));
    }
    fixture.detectChanges();
  }

  async function press(name: string): Promise<void> {
    hook(root, name).click();
    await settle();
  }

  const points = (id: number) => ({
    id,
    seconds: [0, 5],
    values: {
      speed: [10, 20],
      rpm: [null, null],
      coolantTemp: [null, null],
      consumption: [null, null],
      throttle: [null, null],
      voltage: [null, null],
    },
  });

  it('compares the drives of a day and steps back', async () => {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    provide([trip(today), trip(today + HOUR), trip(yesterday.getTime())]);
    await open();
    expect(findHook(root, 'chart-value')).not.toBeNull();
    await press('chart-view-day');
    expect(hooks(root, 'chart-trip-')).toHaveLength(2);
    expect(hook(root, 'chart-line').getAttribute('d')).toContain('L');
    expect(textOf(hook(root, 'chart-numbers'))).toContain('40 km/h');
    await press('chart-earlier');
    expect(hooks(root, 'chart-trip-')).toHaveLength(1);
    await press('chart-earlier');
    expect(textOf(hook(root, 'chart-hint'))).toBe('logbook.history.empty');
  });

  it('shows one drive, or says that its points are gone', async () => {
    provide([trip(today), trip(today + HOUR), trip(today + 2 * HOUR, { stats: undefined })]);
    book.repository.measured.set(today, points(today));
    await open();
    await press('chart-view-day');
    await press('chart-trip-' + today);
    expect(hook(root, 'chart-line').getAttribute('d')).toBe('M0.0 285.0L600.0 270.0');
    await press('chart-back');
    await press('chart-trip-' + (today + HOUR));
    expect(textOf(hook(root, 'chart-hint'))).toBe('logbook.history.only_stats');
    await press('chart-back');
    await press('chart-trip-' + (today + 2 * HOUR));
    expect(textOf(hook(root, 'chart-hint'))).toBe('logbook.history.not_measured');
  });

  it('opens the drive of the address', async () => {
    provide([trip(today)], String(today));
    book.repository.measured.set(today, points(today));
    await open();
    expect(findHook(root, 'chart-title-trip')).not.toBeNull();
    expect(hook(root, 'chart-line').getAttribute('d')).toContain('L');
  });

  it('keeps the values of a drive and drops old ones', async () => {
    vi.useFakeTimers();
    try {
      provide([]);
      book.repository.measured.set(5, points(5));
      const store = TestBed.inject(LogbookStore);
      store.start();
      await TestBed.inject(TelemetryStore).connectObd();
      car.obd.emit({ speed: 60, rpm: 2000, voltage: 14 });
      await vi.advanceTimersByTimeAsync(60_000);
      const id = store.current()?.id ?? 0;
      expect((await store.valuesOf(id))?.seconds.length).toBeGreaterThan(8);
      car.obd.emit({ speed: 0, rpm: 0 });
      await vi.advanceTimersByTimeAsync(250_000);
      expect(book.repository.trips[0].stats?.voltage?.average).toBeCloseTo(14);
      expect(book.repository.trips[0].stats?.speed?.max).toBe(60);
      expect([...book.repository.measured.keys()]).toEqual([id]);
    } finally {
      vi.useRealTimers();
    }
  });
});
