import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { fuelTesting } from '@domains/fuel/testing';
import { navigationTesting } from '@domains/navigation/testing';
import { DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { TelemetryStore } from '@domains/telemetry';
import { telemetryTesting } from '@domains/telemetry/testing';
import { findHook, hook, textOf } from '@shared/testing';
import { WarningStore } from '../application/warning.store';
import { DiagnosticsPage } from './diagnostics-page';
import { VehicleWarningCard } from './vehicle-warning';

describe('diagnostics', () => {
  let car: ReturnType<typeof telemetryTesting>;
  let nav: ReturnType<typeof navigationTesting>;
  let telemetry: TelemetryStore;

  beforeEach(() => {
    car = telemetryTesting();
    nav = navigationTesting();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        ...car.providers,
        ...nav.providers,
        ...fuelTesting().providers,
        { provide: SettingsStore, useValue: { settings: signal(DEFAULT_SETTINGS) } },
      ],
    });
    telemetry = TestBed.inject(TelemetryStore);
  });

  describe('page', () => {
    let fixture: ComponentFixture<DiagnosticsPage>;
    let root: HTMLElement;

    async function open(): Promise<void> {
      fixture = TestBed.createComponent(DiagnosticsPage);
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

    it('needs a connection', async () => {
      await open();
      await press('diagnostics-read');
      expect(textOf(hook(root, 'diagnostics-state'))).toBe('diagnostics.state.not_connected');
    });

    it('reads lamp and codes', async () => {
      await telemetry.connectObd();
      await open();
      car.obd.answers = { '0101': '41 01 81 00 00 00', '03': '43 01 71 12 34 00 00' };
      await press('diagnostics-read');
      expect(textOf(hook(root, 'diagnostics-lamp'))).toContain('lamp_state.true');
      expect(textOf(hook(root, 'diagnostics-code-P0171'))).toContain('diagnostics.code.P0171');
      expect(textOf(hook(root, 'diagnostics-code-P1234'))).toContain('code_unknown');
    });

    it('clears only after the second tap and while standing', async () => {
      await telemetry.connectObd();
      await open();
      car.obd.answers = { '03': '43 01 71 00 00 00 00', '04': '44' };
      await press('diagnostics-read');
      await press('diagnostics-clear');
      expect(car.obd.requested).not.toContain('04');

      car.obd.emit({ speed: 5 });
      await press('diagnostics-clear');
      expect(car.obd.requested).not.toContain('04');
      expect(textOf(hook(root, 'diagnostics-state'))).toBe('diagnostics.state.moving');

      car.obd.emit({ speed: 0 });
      car.obd.answers['03'] = 'NO DATA';
      await press('diagnostics-clear');
      await press('diagnostics-clear');
      expect(car.obd.requested).toContain('04');
      expect(findHook(root, 'diagnostics-none')).not.toBeNull();
    });

    it('never sends anything else to the car', async () => {
      await telemetry.connectObd();
      await expect(telemetry.request('0801')).rejects.toThrow('not allowed');
      expect(car.obd.requested).toEqual([]);
    });
  });

  it('warns on screen and by voice until it is confirmed', async () => {
    vi.useFakeTimers();
    try {
      const store = TestBed.inject(WarningStore);
      store.start();
      await telemetry.startDemo();
      car.demo.emit({ coolantTemp: 108, rpm: 2000 });
      await vi.advanceTimersByTimeAsync(5000);
      const card = TestBed.createComponent(VehicleWarningCard);
      card.detectChanges();
      expect(hook(card.nativeElement, 'warning-card').dataset['warning']).toBe('coolant_hot');
      expect(store.levels()).toEqual({ coolant: 'crit' });
      expect(nav.speech.said).toEqual([
        'diagnostics.warning.coolant_hot.title. diagnostics.warning.coolant_hot.say',
      ]);

      hook(card.nativeElement, 'warning-confirm').click();
      card.detectChanges();
      expect(findHook(card.nativeElement, 'warning-card')).toBeNull();
      expect(store.levels()).toEqual({ coolant: 'crit' });
    } finally {
      vi.useRealTimers();
    }
  });
});
