import { Component, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { BleOffError, BlePermissionError } from '@core/bluetooth';
import { findHook, hook, textOf } from '@shared/testing';
import { AdapterStore } from '../application/adapter.store';
import { TelemetryStore } from '../application/telemetry.store';
import { AdapterUnknownError, reconnectDelayS } from '../domain/adapter';
import { TEST_ADAPTER, TelemetryTesting, telemetryTesting } from '../testing';
import { ObdSettings } from './obd-settings';
import { ObdSetupPage } from './obd-setup-page';

@Component({ template: '' })
class Empty {}

const CAR = {
  ATI: 'ELM327 v2.1',
  ATRV: '12.6V',
  '0100': '41 00 BE 3F A8 13',
  ATDP: 'AUTO, ISO 15765-4 (CAN 11/500)',
  '010C': '41 0C 1A F8',
  '010D': '41 0D 00',
  '0105': 'NO DATA',
};

/** A promise that fails without being reported before someone waits for it. */
function rejected(error: Error): Promise<void> {
  const promise = Promise.reject(error);
  promise.catch(() => undefined);
  return promise;
}

describe('OBD adapter', () => {
  let fixture: ComponentFixture<unknown>;
  let root: HTMLElement;
  let fake: TelemetryTesting;
  let telemetry: TelemetryStore;
  let adapters: AdapterStore;

  async function setup(component: Type<unknown>, before?: () => void): Promise<void> {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 50 });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fake = telemetryTesting();
    fake.link.answers = { ...CAR };
    before?.();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: Empty }]),
        provideI18nTesting(),
        ...fake.providers,
      ],
    });
    telemetry = TestBed.inject(TelemetryStore);
    adapters = TestBed.inject(AdapterStore);
    fixture = TestBed.createComponent(component);
    root = fixture.nativeElement;
    await settle();
  }

  afterEach(() => vi.useRealTimers());

  async function settle(ms = 10): Promise<void> {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(ms);
    }
    fixture.detectChanges();
  }

  async function press(name: string, ms?: number): Promise<void> {
    hook(root, name).click();
    await settle(ms);
  }

  const known = () => (fake.adapters.stored = { adapter: TEST_ADAPTER, autoConnect: false });
  const state = (id: string) => hook(root, 'obd-test-' + id).classList;

  describe('wizard', () => {
    it('leads from the kind to a connected adapter', async () => {
      await setup(ObdSetupPage);
      expect(hook<HTMLButtonElement>(root, 'obd-kind-wifi').disabled).toBe(true);
      expect(hook<HTMLButtonElement>(root, 'obd-kind-mfi').disabled).toBe(true);
      await press('obd-setup-next');
      await press('obd-setup-next');
      expect(hook<HTMLButtonElement>(root, 'obd-setup-next').disabled).toBe(true);

      await press('obd-choose');
      expect(textOf(hook(root, 'obd-setup-chosen'))).toBe('Vgate');
      await press('obd-setup-next');
      await press('obd-setup-test', 500);
      expect(findHook(root, 'obd-setup-passed')).not.toBeNull();
      await press('obd-setup-next');

      hook(root, 'obd-setup-auto').click();
      await settle();
      expect(fake.adapters.stored).toEqual({ adapter: TEST_ADAPTER, autoConnect: true });

      await press('obd-setup-finish');
      expect(telemetry.mode()).toBe('obd');
      expect(TestBed.inject(Router).url).toBe('/');
    });

    it('says when Bluetooth fails, but not when the user cancels', async () => {
      await setup(ObdSetupPage, () => (fake.link.chooseError = new Error('GATT broken')));
      await press('obd-setup-next');
      await press('obd-setup-next');
      await press('obd-choose');
      expect(findHook(root, 'obd-setup-error')).not.toBeNull();

      fake.link.chooseError = new Error('User cancelled the requestDevice() chooser.');
      await press('obd-choose');
      expect(findHook(root, 'obd-setup-error')).toBeNull();
    });

    it('leads to the device settings when Bluetooth was refused', async () => {
      await setup(ObdSetupPage, () => (fake.link.chooseError = new BlePermissionError()));
      await press('obd-setup-next');
      await press('obd-setup-next');
      await press('obd-choose');
      expect(textOf(hook(root, 'obd-setup-error'))).toBe('telemetry.obd.error.permission');
      await press('obd-setup-open-settings');
      expect(fake.link.settingsOpened).toBe(1);

      fake.link.chooseError = new BleOffError();
      await press('obd-choose');
      expect(textOf(hook(root, 'obd-setup-error'))).toBe('telemetry.obd.error.off');
      expect(findHook(root, 'obd-setup-open-settings')).toBeNull();
    });

    it('can go back', async () => {
      await setup(ObdSetupPage);
      await press('obd-setup-next');
      await press('obd-setup-back');
      expect(findHook(root, 'obd-kind-ble')).not.toBeNull();
    });
  });

  describe('test', () => {
    it('reports every step', async () => {
      await setup(ObdSettings, known);
      await press('obd-test', 500);
      for (const id of ['connect', 'adapter', 'voltage', 'ecu', 'values']) {
        expect(state(id)).toContain('ok');
      }
      expect(textOf(hook(root, 'obd-test-voltage'))).toContain('12.6 V');
      expect(textOf(hook(root, 'obd-test-ecu'))).toContain('ISO 15765-4');
      expect(textOf(hook(root, 'obd-test-values'))).toContain('2/5');
      expect(fake.link.closed).toBe(1);
    });

    it('stops where the car does not answer and says what to do', async () => {
      await setup(ObdSettings, () => {
        known();
        fake.link.answers = { ...CAR, ATRV: '?', '0100': 'UNABLE TO CONNECT' };
      });
      await press('obd-test', 500);
      expect(state('adapter')).toContain('ok');
      expect(state('voltage')).toContain('failed');
      expect(state('ecu')).toContain('failed');
      expect(state('values')).toContain('skipped');
      expect(textOf(hook(root, 'obd-test-ecu'))).toContain('telemetry.obd.help.ecu');
      expect(fake.link.closed).toBe(1);
    });

    it('interrupts and resumes a running connection', async () => {
      await setup(ObdSettings, known);
      await telemetry.connectObd();
      await press('obd-test', 500);
      expect(fake.obd.stopped).toBe(1);
      expect(fake.obd.started).toBe(2);
      expect(telemetry.mode()).toBe('obd');
    });
  });

  describe('settings', () => {
    it('offers the wizard while there is no adapter', async () => {
      await setup(ObdSettings);
      expect(hook(root, 'obd-setup').getAttribute('href')).toBe('/obd');
      expect(findHook(root, 'obd-connect')).toBeNull();
    });

    it('forgets an adapter and disconnects it', async () => {
      await setup(ObdSettings, known);
      await press('obd-connect');
      expect(telemetry.mode()).toBe('obd');
      await press('obd-forget');
      expect(telemetry.mode()).toBe('off');
      expect(fake.adapters.stored).toEqual({ adapter: null, autoConnect: false });
    });

    it('shows why connecting failed', async () => {
      await setup(ObdSettings, () => {
        known();
        fake.obd.startResult = rejected(new AdapterUnknownError());
      });
      await press('obd-connect');
      expect(textOf(hook(root, 'obd-error'))).toBe('telemetry.obd.error.unknown');
    });
  });

  describe('connection', () => {
    it('asks for an adapter only the first time', async () => {
      await setup(Empty);
      await telemetry.connectObd();
      await telemetry.stop();
      await telemetry.connectObd();
      expect(fake.link.chosen).toBe(1);
    });

    it('connects at start only if wanted', async () => {
      await setup(Empty, known);
      await telemetry.autoConnect();
      expect(telemetry.mode()).toBe('off');
      await adapters.setAutoConnect(true);
      await telemetry.autoConnect();
      expect(telemetry.mode()).toBe('obd');
      expect(fake.link.chosen).toBe(0);
    });

    it('keeps trying at start until the car is on', async () => {
      await setup(Empty, () => {
        fake.adapters.stored = { adapter: TEST_ADAPTER, autoConnect: true };
        fake.obd.startResult = rejected(new Error('out of range'));
      });
      await telemetry.autoConnect();
      expect(telemetry.mode()).toBe('connecting');
      fake.obd.startResult = Promise.resolve();
      await vi.advanceTimersByTimeAsync(6000);
      expect(telemetry.mode()).toBe('obd');
    });

    it('gives up at start when the adapter must be chosen again', async () => {
      await setup(Empty, () => {
        fake.adapters.stored = { adapter: TEST_ADAPTER, autoConnect: true };
        fake.obd.startResult = rejected(new AdapterUnknownError());
      });
      await telemetry.autoConnect();
      expect(telemetry.mode()).toBe('off');
      await vi.advanceTimersByTimeAsync(60000);
      expect(fake.obd.started).toBe(1);
    });

    it('reconnects on its own after a drop, until it is stopped', async () => {
      await setup(Empty, known);
      await telemetry.connectObd();
      fake.obd.end();
      expect(telemetry.mode()).toBe('connecting');
      await vi.advanceTimersByTimeAsync(2100);
      expect(telemetry.mode()).toBe('obd');

      fake.obd.end();
      await telemetry.stop();
      await vi.advanceTimersByTimeAsync(60000);
      expect(telemetry.mode()).toBe('off');
      expect(fake.obd.started).toBe(2);
    });

    it('waits longer after every failed attempt', () => {
      expect([0, 1, 2, 3, 9].map(reconnectDelayS)).toEqual([2, 5, 10, 30, 30]);
    });
  });
});
