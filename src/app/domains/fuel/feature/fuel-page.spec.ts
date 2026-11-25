import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { MapPinsStore, NavigationStore, PositionStore } from '@domains/navigation';
import { navigationTesting } from '@domains/navigation/testing';
import { DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { TelemetryStore } from '@domains/telemetry';
import { telemetryTesting } from '@domains/telemetry/testing';
import { findHook, hook, hooks, textOf } from '@shared/testing';
import { FuelStore } from '../application/fuel.store';
import { Station } from '../domain/stations';
import { fuelTesting } from '../testing';
import { FuelAlert } from './fuel-alert';
import { FuelPage } from './fuel-page';

const station = (id: string, lat: number, openingHours = ''): Station => ({
  id,
  name: id,
  address: '',
  at: [8.54, lat],
  openingHours,
  lacks: [],
});

describe('fuel', () => {
  let fixture: ComponentFixture<FuelPage>;
  let root: HTMLElement;
  let nav: ReturnType<typeof navigationTesting>;
  let fuel: ReturnType<typeof fuelTesting>;
  let car: ReturnType<typeof telemetryTesting>;

  async function setup(located = true): Promise<void> {
    nav = navigationTesting();
    fuel = fuelTesting();
    car = telemetryTesting();
    nav.gps.allowed = true;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        ...car.providers,
        ...nav.providers,
        ...fuel.providers,
        { provide: SettingsStore, useValue: { settings: signal(DEFAULT_SETTINGS) } },
      ],
    });
    await TestBed.inject(PositionStore).start(false);
    if (located) nav.gps.emit([8.54, 47.38], 0);
  }

  async function open(): Promise<void> {
    fixture = TestBed.createComponent(FuelPage);
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

  it('lists the nearest stations, puts them on the map and leads there', async () => {
    await setup();
    fuel.source.quick = [station('Far', 47.4), station('Near', 47.381)];
    fuel.source.details = [station('Far', 47.4, '24/7')];
    await open();
    expect(textOf(hook(root, 'fuel-go-0'))).toContain('Near');
    expect(textOf(hook(root, 'fuel-go-1'))).toContain('fuel.open');
    expect(TestBed.inject(MapPinsStore).pins()).toHaveLength(2);

    const go = vi.spyOn(TestBed.inject(NavigationStore), 'navigateTo').mockResolvedValue(true);
    hook(root, 'fuel-go-0').click();
    await settle();
    expect(go).toHaveBeenCalledWith(expect.objectContaining({ name: 'Near' }));
  });

  it('still finds stations when one service fails', async () => {
    await setup();
    fuel.source.quick = new Error('offline');
    fuel.source.details = [station('A', 47.381)];
    await open();
    expect(hooks(root, 'fuel-go-')).toHaveLength(1);
  });

  it('says why there are none', async () => {
    await setup();
    await open();
    expect(textOf(hook(root, 'fuel-state'))).toBe('fuel.state.empty');
    fuel.source.quick = new Error('offline');
    hook(root, 'fuel-search-near').click();
    await settle();
    expect(textOf(hook(root, 'fuel-state'))).toBe('fuel.state.failed');
  });

  it('says so while the position is unknown', async () => {
    await setup(false);
    await open();
    expect(textOf(hook(root, 'fuel-state'))).toBe('fuel.state.no_position');
    expect(findHook(root, 'fuel-search-route')).toBeNull();
  });

  it('counts by hand only without a sensor', async () => {
    await setup();
    await open();
    expect(textOf(hook(root, 'fuel-range'))).toContain('–');
    hook(root, 'fuel-full').click();
    await settle();
    expect(fuel.tank.state?.litres).toBe(55);
    expect(textOf(hook(root, 'fuel-range'))).toContain('688');

    const litres = hook<HTMLInputElement>(root, 'fuel-litres');
    litres.value = '99';
    litres.dispatchEvent(new Event('change'));
    await settle();
    expect(fuel.tank.state?.litres).toBe(55);

    await TestBed.inject(TelemetryStore).startDemo();
    car.demo.emit({ fuelLevel: 50 });
    await settle();
    expect(findHook(root, 'fuel-full')).toBeNull();
    expect(textOf(hook(root, 'fuel-tank'))).toContain('27.5');
  });

  it('warns once when the range gets short', async () => {
    vi.useFakeTimers();
    try {
      await setup();
      fuel.source.quick = [station('Near', 47.381)];
      const store = TestBed.inject(FuelStore);
      await store.start();
      await TestBed.inject(TelemetryStore).startDemo();
      car.demo.emit({ fuelLevel: 9 });
      await vi.advanceTimersByTimeAsync(5000);
      expect(store.alert()).toBe(true);
      expect(nav.speech.said).toEqual(['fuel.say.low_near']);
      expect(nav.speech.kinds).toEqual(['nav']);

      const alert = TestBed.createComponent(FuelAlert);
      alert.detectChanges();
      hook(alert.nativeElement, 'fuel-alert-confirm').click();
      expect(store.alert()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
