import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { UnitsStore } from '@core/units';
import { TelemetryStore } from '@domains/telemetry';
import { telemetryTesting } from '@domains/telemetry/testing';
import { METRIC } from '@shared/kernel/units';
import { findHook, hook, hooks, textOf } from '@shared/testing';
import { MaintenanceStore } from '../application/maintenance.store';
import { DEFAULT_PLAN, MaintenancePlan } from '../domain/maintenance';
import { maintenanceTesting } from '../testing';
import { MaintenanceNotice } from './maintenance-notice';
import { MaintenancePage } from './maintenance-page';

describe('maintenance', () => {
  let fixture: ComponentFixture<MaintenancePage>;
  let root: HTMLElement;
  let car: ReturnType<typeof telemetryTesting>;
  let repository: ReturnType<typeof maintenanceTesting>['repository'];

  function setup(stored?: Partial<MaintenancePlan>): void {
    const maintenance = maintenanceTesting();
    repository = maintenance.repository;
    repository.plan = stored;
    car = telemetryTesting();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        ...car.providers,
        ...maintenance.providers,
      ],
    });
  }

  async function open(stored?: Partial<MaintenancePlan>): Promise<void> {
    setup(stored);
    fixture = TestBed.createComponent(MaintenancePage);
    root = fixture.nativeElement;
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const input = (name: string) => hook<HTMLInputElement>(root, 'maintenance-' + name);
  const level = (id: string) => hook(root, 'maintenance-level-' + id);
  const lastSaved = () => repository.saved[repository.saved.length - 1];

  async function enter(name: string, value: string): Promise<void> {
    input(name).value = value;
    input(name).dispatchEvent(new Event('change'));
    await settle();
  }

  async function tap(name: string): Promise<void> {
    hook(root, 'maintenance-' + name).click();
    await settle();
  }

  it('lists the default jobs as unknown while nothing was entered', async () => {
    await open();
    expect(input('odometer').value).toBe('');
    expect(hooks(root, 'maintenance-item-')).toHaveLength(DEFAULT_PLAN.items.length);
    expect(level('service').className).toBe('lv-unknown');
    expect(textOf(hook(root, 'maintenance-toggle-service'))).toContain('maintenance.item.service');
  });

  it('shows the stored odometer reading and due state', async () => {
    const [service, ...others] = DEFAULT_PLAN.items;
    await open({ odometerKm: 50_000.4, items: [{ ...service, lastKm: 20_000 }, ...others] });
    expect(input('odometer').value).toBe('50000');
    expect(level('service').className).toBe('lv-overdue');
    expect(textOf(hook(root, 'maintenance-toggle-service'))).toContain('maintenance.km_over');
    expect(hook(root, 'maintenance-progress-service').style.width).toBe('100%');
  });

  it('saves a rounded odometer reading', async () => {
    await open();
    await enter('odometer', '123456.7');
    expect(lastSaved().odometerKm).toBe(123_457);
    expect(lastSaved().odometerUpdatedAt).toBeGreaterThan(0);
  });

  it.each(['', '-5', '0'])('ignores the odometer input "%s"', async (value) => {
    await open();
    await enter('odometer', value);
    expect(repository.saved).toEqual([]);
    expect(input('odometer').value).toBe('');
  });

  it('takes distances in miles when chosen', async () => {
    await open();
    TestBed.inject(UnitsStore).set({ ...METRIC, distance: 'mi' });
    await settle();
    await enter('odometer', '1000');
    expect(lastSaved().odometerKm).toBeCloseTo(1609.344);
    expect(input('odometer').value).toBe('1000');
  });

  it('asks for the odometer before a job is marked as done', async () => {
    await open();
    await tap('done-service');
    expect(findHook(root, 'maintenance-odometer-missing')).not.toBeNull();
    expect(repository.saved).toEqual([]);

    await enter('odometer', '100000');
    expect(findHook(root, 'maintenance-odometer-missing')).toBeNull();
    await tap('done-service');
    expect(lastSaved().items[0].lastKm).toBe(100_000);
    expect(lastSaved().items[0].lastDate).not.toBeNull();
    expect(level('service').className).toBe('lv-ok');
    expect(level('oil').className).toBe('lv-unknown');
  });

  it('edits a job', async () => {
    await open();
    await enter('name-oil', ' Motoröl ');
    await enter('interval-km-oil', '10000');
    await enter('interval-months-oil', '');
    await enter('last-km-oil', '90000');
    await enter('last-date-oil', '2026-05-03');
    expect(lastSaved().items[1]).toEqual({
      id: 'oil',
      name: 'Motoröl',
      icon: 'ti-droplet',
      intervalKm: 10_000,
      intervalMonths: 0,
      lastKm: 90_000,
      lastDate: new Date(2026, 4, 3).getTime(),
    });
    await enter('interval-km-oil', '-1');
    expect(input('interval-km-oil').value).toBe('10000');
  });

  it('adds an own job and deletes it with the second tap', async () => {
    await open();
    await tap('add');
    expect(repository.saved).toEqual([]);
    input('new-name').value = 'Reifen';
    await tap('add');
    expect(textOf(hook(root, 'maintenance-toggle-own-1'))).toContain('Reifen');
    expect(findHook(root, 'maintenance-delete-oil')).toBeNull();

    await tap('delete-own-1');
    expect(findHook(root, 'maintenance-item-own-1')).not.toBeNull();
    await tap('delete-own-1');
    expect(findHook(root, 'maintenance-item-own-1')).toBeNull();
    expect(lastSaved().items).toHaveLength(5);
  });

  it('keeps inspection date and vignette year', async () => {
    await open();
    await enter('inspection', '2000-01-01');
    expect(textOf(hook(root, 'maintenance-inspection-state'))).toContain('level.overdue');
    await enter('vignette', '2000');
    expect(textOf(hook(root, 'maintenance-vignette-state'))).toContain('vignette_expired');
    expect(lastSaved()).toMatchObject({ inspectionDate: '2000-01-01', vignetteYear: 2000 });
    await enter('vignette', '20');
    expect(input('vignette').value).toBe('2000');
    expect(TestBed.inject(MaintenanceStore).level()).toBe('overdue');
  });

  it('does not overwrite a plan that could not be read', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setup();
    repository.loadError = new Error('locked');
    const store = TestBed.inject(MaintenanceStore);
    await store.setOdometer(5);
    expect(repository.saved).toEqual([]);
    repository.loadError = undefined;
    await store.setOdometer(5);
    expect(lastSaved().odometerKm).toBe(5);
    log.mockRestore();
  });

  it('counts driving, but not the demo', async () => {
    vi.useFakeTimers();
    try {
      setup({ odometerKm: 1000 });
      const store = TestBed.inject(MaintenanceStore);
      const telemetry = TestBed.inject(TelemetryStore);
      await store.start();
      await telemetry.startDemo();
      car.demo.emit({ speed: 72 });
      await vi.advanceTimersByTimeAsync(20_000);
      expect(store.plan().odometerKm).toBe(1000);

      await telemetry.connectObd();
      car.obd.emit({ speed: 72 });
      await vi.advanceTimersByTimeAsync(20_000);
      expect(store.plan().odometerKm).toBeCloseTo(1000.4);
      expect(repository.saved).toHaveLength(1);

      await telemetry.stop();
      await vi.advanceTimersByTimeAsync(3000);
      expect(repository.saved).toHaveLength(2);
      expect(lastSaved().odometerKm).toBeCloseTo(1000.4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tells once at start what is due', async () => {
    vi.useFakeTimers();
    try {
      setup({ inspectionDate: '2000-01-01' });
      const store = TestBed.inject(MaintenanceStore);
      const notice = TestBed.createComponent(MaintenanceNotice);
      notice.detectChanges();
      expect(findHook(notice.nativeElement, 'maintenance-notice')).toBeNull();

      await store.start();
      notice.detectChanges();
      const text = textOf(hook(notice.nativeElement, 'maintenance-notice'));
      expect(text).toContain('maintenance.item.inspection');
      expect(text).not.toContain('maintenance.item.vignette');

      hook(notice.nativeElement, 'maintenance-notice-confirm').click();
      notice.detectChanges();
      expect(findHook(notice.nativeElement, 'maintenance-notice')).toBeNull();
      await store.start();
      expect(store.notice()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
