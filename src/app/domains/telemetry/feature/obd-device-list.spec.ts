import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '@core/i18n/testing';
import { hook, textOf } from '@shared/testing';
import { AdapterStore } from '../application/adapter.store';
import { AdapterRef, FoundAdapter } from '../domain/adapter';
import { ObdDeviceList } from './obd-device-list';

describe('ObdDeviceList', () => {
  const stopped = vi.fn(async () => undefined);
  let report: (found: FoundAdapter) => void;
  let scan: () => Promise<() => Promise<void>>;

  function setup() {
    stopped.mockClear();
    const store = {
      scan: (_kind: string, onFound: (found: FoundAdapter) => void) => {
        report = onFound;
        return scan();
      },
    };
    TestBed.configureTestingModule({
      providers: [provideI18nTesting(), { provide: AdapterStore, useValue: store }],
    });
    const fixture = TestBed.createComponent(ObdDeviceList);
    const root: HTMLElement = fixture.nativeElement;
    fixture.detectChanges();
    const press = async (name: string) => {
      hook(root, name).click();
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
    };
    return { fixture, root, press };
  }

  it('offers likely adapters first and hides strangers', async () => {
    scan = async () => stopped;
    const { fixture, root, press } = setup();
    let chosen: AdapterRef | undefined;
    fixture.componentInstance.chosen.subscribe((adapter) => (chosen = adapter));
    await press('obd-scan');
    report({ adapter: { kind: 'ble', id: '1', name: 'TV' }, match: 'unknown', rssi: -40 });
    report({ adapter: { kind: 'ble', id: '2', name: 'OBDII' }, match: 'likely', rssi: -60 });
    fixture.detectChanges();
    expect(root.querySelectorAll('li')).toHaveLength(1);
    await press('obd-scan-all');
    expect(root.querySelectorAll('li')).toHaveLength(2);
    expect(textOf(hook(root, 'obd-device-0'))).toContain('OBDII');
    await press('obd-device-0');
    expect(chosen?.id).toBe('2');
    expect(stopped).toHaveBeenCalled();
  });

  it('reports why scanning failed', async () => {
    scan = () => Promise.reject(new Error('off'));
    const { fixture, press } = setup();
    let failed: unknown;
    fixture.componentInstance.failed.subscribe((error) => (failed = error));
    await press('obd-scan');
    expect((failed as Error).message).toBe('off');
  });
});
