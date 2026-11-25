import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { findHook, hook, textOf } from '@shared/testing';
import { ADAPTER_LINKS, AdapterStore } from '../application/adapter.store';
import { AdapterKind, AdapterLink, AdapterRef, AdapterUnknownError } from '../domain/adapter';
import { wifiAdapter } from '../domain/wifi-adapter';
import { TEST_ADAPTER, TelemetryTesting, telemetryTesting } from '../testing';
import { ObdSetupPage } from './obd-setup-page';

@Component({ template: '' })
class Empty {}

const ACCESSORY: AdapterRef = { kind: 'mfi', id: 'S1', name: 'OBDLink MX+' };

class FakeSerialLink extends AdapterLink {
  accessories: AdapterRef[] = [];
  error?: Error;
  constructor(readonly kind: AdapterKind) {
    super();
  }
  async openSettings(): Promise<boolean> {
    return false;
  }
  async choose(): Promise<AdapterRef> {
    throw new Error('not used');
  }
  override async connected(): Promise<readonly AdapterRef[]> {
    if (this.error) throw this.error;
    return this.accessories;
  }
  async open(): Promise<never> {
    throw new Error('not used');
  }
}

describe('OBD wizard: WiFi and MFi', () => {
  let fixture: ComponentFixture<ObdSetupPage>;
  let root: HTMLElement;
  let fake: TelemetryTesting;
  let mfi: FakeSerialLink;

  async function setup(before?: () => void, kinds: AdapterKind[] = ['wifi', 'mfi']): Promise<void> {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fake = telemetryTesting();
    mfi = new FakeSerialLink('mfi');
    before?.();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: Empty }]),
        provideI18nTesting(),
        ...fake.providers,
        ...kinds.map((kind) => ({
          provide: ADAPTER_LINKS,
          useValue: kind === 'mfi' ? mfi : new FakeSerialLink(kind),
          multi: true,
        })),
      ],
    });
    fixture = TestBed.createComponent(ObdSetupPage);
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

  async function type(name: string, text: string): Promise<void> {
    const input = hook<HTMLInputElement>(root, name);
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function toChoose(kind: AdapterKind): Promise<void> {
    await press('obd-kind-' + kind);
    await press('obd-setup-next');
    await press('obd-setup-next');
  }

  const disabled = (name: string) => hook<HTMLButtonElement>(root, name).disabled;

  it('says why a kind cannot be used here', async () => {
    await setup(undefined, []);
    for (const kind of ['wifi', 'mfi']) {
      expect(disabled('obd-kind-' + kind)).toBe(true);
      expect(textOf(hook(root, 'obd-kind-' + kind))).toContain(
        'telemetry.obd.kind_unavailable.' + kind,
      );
    }
    expect(textOf(hook(root, 'obd-kind-ble'))).toContain('telemetry.obd.kind_note.ble');
  });

  it('tells how to reach a WiFi adapter', async () => {
    await setup();
    await press('obd-kind-wifi');
    await press('obd-setup-next');
    const text = textOf(root);
    expect(text).toContain('telemetry.obd.prepare.wifi_join');
    expect(text).toContain('telemetry.obd.prepare.wifi_permission');
    expect(text).not.toContain('telemetry.obd.prepare.bluetooth');
  });

  it('saves the usual address', async () => {
    await setup();
    await toChoose('wifi');
    expect(findHook(root, 'obd-choose')).toBeNull();
    expect(disabled('obd-setup-next')).toBe(true);
    await press('obd-wifi-use');
    expect(textOf(hook(root, 'obd-setup-chosen'))).toBe('192.168.0.10:35000');
    expect(fake.adapters.stored.adapter).toEqual(
      wifiAdapter({ host: '192.168.0.10', port: 35000 }),
    );
    expect(disabled('obd-setup-next')).toBe(false);
  });

  it('checks host and port', async () => {
    await setup();
    await toChoose('wifi');
    await type('obd-wifi-host', '192.168.0.300');
    expect(findHook(root, 'obd-wifi-host-error')).not.toBeNull();
    expect(disabled('obd-wifi-use')).toBe(true);
    await type('obd-wifi-host', 'obd.local');
    await type('obd-wifi-port', '70000');
    expect(findHook(root, 'obd-wifi-host-error')).toBeNull();
    expect(findHook(root, 'obd-wifi-port-error')).not.toBeNull();
    await type('obd-wifi-port', '23');
    await press('obd-wifi-use');
    expect(fake.adapters.stored.adapter).toEqual(wifiAdapter({ host: 'obd.local', port: 23 }));
  });

  it('shows the stored address and wants a changed one to be taken first', async () => {
    const adapter = wifiAdapter({ host: '10.0.0.5', port: 23 });
    await setup(() => (fake.adapters.stored = { adapter, autoConnect: true }));
    await toChoose('wifi');
    expect(hook<HTMLInputElement>(root, 'obd-wifi-host').value).toBe('10.0.0.5');
    expect(hook<HTMLInputElement>(root, 'obd-wifi-port').value).toBe('23');
    expect(disabled('obd-setup-next')).toBe(false);
    await type('obd-wifi-port', '24');
    expect(disabled('obd-setup-next')).toBe(true);
  });

  it('does not continue with an adapter of another kind', async () => {
    await setup(() => (fake.adapters.stored = { adapter: TEST_ADAPTER, autoConnect: false }));
    await toChoose('wifi');
    expect(findHook(root, 'obd-setup-chosen')).toBeNull();
    expect(disabled('obd-setup-next')).toBe(true);
  });

  it('offers the connected accessories', async () => {
    await setup(() => (mfi.accessories = [ACCESSORY]));
    await toChoose('mfi');
    await press('obd-accessory-S1');
    expect(textOf(hook(root, 'obd-setup-chosen'))).toBe('OBDLink MX+');
    expect(fake.adapters.stored.adapter).toEqual(ACCESSORY);
    expect(disabled('obd-setup-next')).toBe(false);
  });

  it('looks for accessories again', async () => {
    await setup(() => (mfi.error = new Error('broken')));
    await toChoose('mfi');
    expect(findHook(root, 'obd-accessory-error')).not.toBeNull();
    mfi.error = undefined;
    await press('obd-accessory-refresh');
    expect(findHook(root, 'obd-accessory-error')).toBeNull();
    expect(findHook(root, 'obd-accessory-none')).not.toBeNull();
    mfi.accessories = [ACCESSORY];
    await press('obd-accessory-refresh');
    expect(findHook(root, 'obd-accessory-S1')).not.toBeNull();
  });

  it('asks for another adapter where the stored kind does not work', async () => {
    const adapter = wifiAdapter({ host: '10.0.0.5', port: 23 });
    await setup(() => (fake.adapters.stored = { adapter, autoConnect: true }), []);
    expect(() => TestBed.inject(AdapterStore).open(adapter, () => undefined)).toThrow(
      AdapterUnknownError,
    );
  });
});
