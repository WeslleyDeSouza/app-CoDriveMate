import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { hook, textOf } from '@shared/testing';
import { HistoryStore } from '../application/history.store';
import { TelemetryStore } from '../application/telemetry.store';
import { SERIES } from '../domain/history';
import { telemetryTesting } from '../testing';
import { LiveChart } from './live-chart';

describe('LiveChart', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('draws what was driven and changes the value shown', async () => {
    const car = telemetryTesting();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideI18nTesting(), ...car.providers],
    });
    TestBed.inject(HistoryStore);
    const fixture = TestBed.createComponent(LiveChart);
    fixture.componentRef.setInput('series', SERIES[0]);
    const root: HTMLElement = fixture.nativeElement;
    fixture.detectChanges();
    expect(textOf(hook(root, 'chart-hint'))).toBe('telemetry.chart.empty');

    await TestBed.inject(TelemetryStore).startDemo();
    TestBed.tick();
    car.demo.emit({ speed: 62, voltage: 14.1 });
    await vi.advanceTimersByTimeAsync(2000);
    fixture.detectChanges();
    expect(hook(root, 'chart-line').getAttribute('d')).toContain('L');
    expect(textOf(hook(root, 'chart-value'))).toBe('62 km/h');

    fixture.componentRef.setInput(
      'series',
      SERIES.find(({ key }) => key === 'voltage'),
    );
    fixture.detectChanges();
    expect(textOf(hook(root, 'chart-value'))).toBe('14.1 V');
  });
});
