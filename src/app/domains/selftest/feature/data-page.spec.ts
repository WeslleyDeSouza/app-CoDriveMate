import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BleTrace, BleTransport } from '@core/bluetooth';
import { provideI18nTesting } from '@core/i18n/testing';
import { lightingTesting } from '@domains/lighting/testing';
import { mediaTesting } from '@domains/media/testing';
import { navigationTesting } from '@domains/navigation/testing';
import { scene3dTesting } from '@domains/scene3d/testing';
import { DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { TelemetryStore } from '@domains/telemetry';
import { telemetryTesting } from '@domains/telemetry/testing';
import { findHook, hook } from '@shared/testing';
import { DataPage } from './data-page';

describe('DataPage', () => {
  let fixture: ComponentFixture<DataPage>;
  let root: HTMLElement;
  let car: ReturnType<typeof telemetryTesting>;
  let light: ReturnType<typeof lightingTesting>;
  const writeText = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    writeText.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { userAgent: 'test', onLine: true, clipboard: { writeText } });
    car = telemetryTesting();
    light = lightingTesting();
    const keys = { ...DEFAULT_SETTINGS.keys, mapbox: 'pk.secret' };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        ...car.providers,
        ...light.providers,
        ...mediaTesting().providers,
        ...navigationTesting().providers,
        ...scene3dTesting().providers,
        { provide: BleTransport, useValue: { characteristics: async () => [] } },
        { provide: SettingsStore, useValue: { settings: signal({ ...DEFAULT_SETTINGS, keys }) } },
      ],
    });
    fixture = TestBed.createComponent(DataPage);
    root = fixture.nativeElement;
    fixture.detectChanges();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function press(name: string): Promise<void> {
    hook(root, name).click();
    await vi.advanceTimersByTimeAsync(2000);
    fixture.detectChanges();
  }
  const json = () => JSON.parse(hook<HTMLTextAreaElement>(root, 'data-json').value);

  it('says when no adapter is connected', async () => {
    await press('data-read-obd');
    expect(findHook(root, 'data-failed')).not.toBeNull();
    expect(findHook(root, 'data-json')).toBeNull();
  });

  it('reads the car without changing it and copies the answer', async () => {
    car.obd.answers = { '0100': '41 00 00 10 00 00', '010C': '41 0C 1F 40' };
    await TestBed.inject(TelemetryStore).connectObd();
    await press('data-read-obd');
    expect(json()).toMatchObject({ kind: 'obd', complete: true, supportedPids: ['0C'] });
    expect(car.obd.requested).not.toContain('04');
    expect(car.obd.requested).not.toContain('0902');
    await press('data-copy');
    expect(writeText).toHaveBeenCalledWith(hook<HTMLTextAreaElement>(root, 'data-json').value);
  });

  it('shows what the light module sent', async () => {
    light.repository.device = { id: 'm1', name: 'Currus Licht' };
    TestBed.inject(BleTrace).data('m1', 'in', 'state', Uint8Array.of(4, 0, 0, 124));
    await press('data-read-esp');
    expect(json().light.device).toBe('Currus Licht');
    expect(json().light.bluetooth.frames[0].hex).toBe('04 00 00 7c');
    expect(json().media.device).toBeNull();
  });

  it('tells about the 3D view without place and key', async () => {
    await press('data-read-scene');
    expect(json()).toMatchObject({
      kind: 'scene',
      keys: { mapbox: true },
      mapBehindCar: 'missing',
    });
    expect(JSON.stringify(json())).not.toContain('pk.secret');
  });
});
