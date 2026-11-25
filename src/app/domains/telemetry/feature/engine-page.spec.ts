import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { hooks } from '@shared/testing';
import { TelemetryStore } from '../application/telemetry.store';
import { emptySnapshot } from '../domain/telemetry';
import { TelemetryTesting, telemetryTesting } from '../testing';
import { EnginePage } from './engine-page';

describe('EnginePage', () => {
  let fixture: ComponentFixture<EnginePage>;
  let root: HTMLElement;
  let telemetry: TelemetryTesting;

  beforeEach(async () => {
    telemetry = telemetryTesting();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideI18nTesting(), ...telemetry.providers],
    });
    fixture = TestBed.createComponent(EnginePage);
    root = fixture.nativeElement;
    await render();
  });

  async function render(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Value and unit per gauge, keyed by telemetry value. */
  function gauges(): Record<string, string> {
    return Object.fromEntries(
      hooks(root, 'engine-')
        // Not the frame of the page (engine-title, engine-close, engine-body).
        .filter((gauge) => gauge.querySelector(':scope > b'))
        .map((gauge) => [
          gauge.dataset['sectionTest']!.slice('engine-'.length),
          gauge.querySelector('b')!.childNodes[0].textContent +
            ' ' +
            gauge.querySelector('b span')!.textContent,
        ]),
    );
  }

  it('offers a gauge for every telemetry value', () => {
    const keys = Object.keys(emptySnapshot());

    expect(Object.keys(gauges()).sort()).toEqual(keys.sort());
  });

  it('shows a dash for values the car does not deliver', () => {
    const shown = gauges();

    expect(shown['rpm']).toBe('0 1/min');
    expect(shown['speed']).toBe('0 km/h');
    expect(shown['massAirFlow']).toBe('– g/s');
    expect(shown['fuelLevel']).toBe('– %');
  });

  it('formats live values with the precision of each gauge', async () => {
    await TestBed.inject(TelemetryStore).startDemo();
    telemetry.demo.emit({
      rpm: 2412.4,
      coolantTemp: 89.6,
      massAirFlow: 10.26,
      shortFuelTrim: -2.34,
      oxygenVoltage: 0.456,
      voltage: 14.12,
    });
    await render();

    const shown = gauges();
    expect(shown['rpm']).toBe('2412 1/min');
    expect(shown['coolantTemp']).toBe('90 °C');
    expect(shown['massAirFlow']).toBe('10.3 g/s');
    expect(shown['shortFuelTrim']).toBe('-2.3 %');
    expect(shown['oxygenVoltage']).toBe('0.46 V');
    expect(shown['voltage']).toBe('14.1 V');
    expect(shown['intakeTemp']).toBe('– °C');
  });
});
