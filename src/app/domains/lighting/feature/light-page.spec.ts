import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { TelemetryStore } from '@domains/telemetry';
import { telemetryTesting } from '@domains/telemetry/testing';
import { hook, textOf } from '@shared/testing';
import { LightStore } from '../application/light.store';
import { lightingTesting } from '../testing';
import { LightPage } from './light-page';

describe('LightPage', () => {
  let fixture: ComponentFixture<LightPage>;
  let root: HTMLElement;
  let light: ReturnType<typeof lightingTesting>;
  let car: ReturnType<typeof telemetryTesting>;

  beforeEach(async () => {
    light = lightingTesting();
    car = telemetryTesting();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideI18nTesting(), ...car.providers, ...light.providers],
    });
    fixture = TestBed.createComponent(LightPage);
    root = fixture.nativeElement;
    await settle();
  });

  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));
    }
    fixture.detectChanges();
  }
  async function press(name: string): Promise<void> {
    hook(root, name).click();
    await settle();
  }
  const sent = () => light.module.sent.map((command) => [...command]);

  it('is a preview without a module', async () => {
    await press('lighting-scene-petrol');
    expect(sent()).toEqual([]);
    expect(TestBed.inject(LightStore).state().zones[0]).toMatchObject({ g: 180, on: true });
  });

  it('brings the module to the present state and sends changes', async () => {
    await press('lighting-connect');
    expect(textOf(hook(root, 'lighting-status'))).toBe('lighting.status.connected');
    expect(sent()).toEqual([
      [1, 15, 1, 255, 147, 41, 110, 0, 60],
      [2, 255, 0],
    ]);
    light.module.sent.length = 0;
    await press('lighting-zone-boot');
    await press('lighting-color-6a5cff');
    expect(sent()).toEqual([[1, 7, 1, 106, 92, 255, 110, 0, 60]]);
    light.module.sent.length = 0;
    await press('lighting-scene-off');
    expect(sent()).toEqual([[3]]);
  });

  it('dims as soon as the car moves', async () => {
    await press('lighting-connect');
    light.module.sent.length = 0;
    await TestBed.inject(TelemetryStore).startDemo();
    car.demo.emit({ speed: 30 });
    await settle();
    expect(sent()).toEqual([[2, 77, 1]]);
    car.demo.emit({ speed: 0 });
    await settle();
    expect(sent()[1]).toEqual([2, 255, 0]);
  });

  it('finds modules with older firmware by name', async () => {
    await press('lighting-connect-picasso');
    expect(light.module.searched).toEqual(['picasso']);
  });

  it('says when the connection fails', async () => {
    light.module.failure = new Error('off');
    await press('lighting-connect');
    expect(textOf(hook(root, 'lighting-status'))).toBe('lighting.status.failed');
  });

  it('connects again after the link was lost', async () => {
    await press('lighting-connect');
    vi.useFakeTimers();
    try {
      light.module.drop();
      expect(TestBed.inject(LightStore).status()).toBe('off');
      await vi.advanceTimersByTimeAsync(2500);
      expect(TestBed.inject(LightStore).status()).toBe('connected');
    } finally {
      vi.useRealTimers();
    }
  });
});
