import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '@core/i18n/testing';
import { findHook, hook, textOf } from '@shared/testing';
import { TelemetryStore } from '../application/telemetry.store';
import { telemetryTesting } from '../testing';
import { SpeedGauge } from './speed-gauge';

describe('SpeedGauge', () => {
  async function setup(limitKmh: number | null, demo = true) {
    const telemetry = telemetryTesting();
    TestBed.configureTestingModule({ providers: [provideI18nTesting(), ...telemetry.providers] });
    const store = TestBed.inject(TelemetryStore);
    if (demo) await store.startDemo();
    const fixture = TestBed.createComponent(SpeedGauge);
    fixture.componentRef.setInput('limitKmh', limitKmh);
    const root: HTMLElement = fixture.nativeElement;
    fixture.detectChanges();
    return { fixture, root, store, telemetry };
  }

  it('rests at zero without a source', async () => {
    const { root } = await setup(null, false);
    expect(textOf(hook(root, 'gauge-speed'))).toBe('0');
    expect(hook(root, 'gauge-needle').style.transform).toBe('rotate(-135deg)');
    expect(findHook(root, 'gauge-limit')).toBeNull();
  });

  it('marks the limit on the dial', async () => {
    const { root } = await setup(50);
    expect(findHook(root, 'gauge-limit')).not.toBeNull();
  });
});
