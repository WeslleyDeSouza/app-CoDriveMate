import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { UnitsStore } from '@core/units';
import { Quantity, Units, pressureIn, speedIn, temperatureIn } from '@shared/kernel/units';
import { SheetPage } from '@shared/ui/sheet-page';
import { TelemetryStore } from '../application/telemetry.store';
import { TelemetryKey } from '../domain/telemetry';

interface Gauge {
  key: TelemetryKey;
  icon: string;
  unit: string;
  digits: number;
}

const GAUGES: readonly Gauge[] = [
  { key: 'rpm', icon: 'gauge', unit: '1/min', digits: 0 },
  { key: 'speed', icon: 'brand-speedtest', unit: 'km/h', digits: 0 },
  { key: 'throttle', icon: 'adjustments-horizontal', unit: '%', digits: 0 },
  { key: 'load', icon: 'engine', unit: '%', digits: 0 },
  { key: 'coolantTemp', icon: 'temperature', unit: '°C', digits: 0 },
  { key: 'intakeTemp', icon: 'wind', unit: '°C', digits: 0 },
  { key: 'manifoldPressure', icon: 'arrows-minimize', unit: 'kPa', digits: 0 },
  { key: 'massAirFlow', icon: 'air-conditioning', unit: 'g/s', digits: 1 },
  { key: 'timingAdvance', icon: 'bolt', unit: '°', digits: 1 },
  { key: 'shortFuelTrim', icon: 'chart-line', unit: '%', digits: 1 },
  { key: 'longFuelTrim', icon: 'chart-dots', unit: '%', digits: 1 },
  { key: 'oxygenVoltage', icon: 'flask', unit: 'V', digits: 2 },
  { key: 'voltage', icon: 'battery-automotive', unit: 'V', digits: 1 },
  { key: 'fuelLevel', icon: 'gas-station', unit: '%', digits: 0 },
];

const CONVERT: Partial<Record<TelemetryKey, (value: number, units: Units) => Quantity>> = {
  speed: speedIn,
  coolantTemp: temperatureIn,
  intakeTemp: temperatureIn,
  manifoldPressure: pressureIn,
};

/** All live engine values at a glance. */
@Component({
  selector: 'app-engine-page',
  imports: [SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet-page section="engine" [title]="'telemetry.engine_title' | translate">
      <div class="grid">
        @for (gauge of gauges(); track gauge.key) {
          <div class="m" [attr.data-section-test]="'engine-' + gauge.key">
            <small>
              <i class="ti" [class]="'ti-' + gauge.icon" aria-hidden="true"></i>
              {{ 'telemetry.value.' + gauge.key | translate }}
            </small>
            <b
              >{{ gauge.text }}<span>{{ gauge.unit }}</span></b
            >
          </div>
        }
      </div>
    </app-sheet-page>
  `,
})
export class EnginePage {
  private readonly store = inject(TelemetryStore);
  private readonly units = inject(UnitsStore).units;

  protected readonly gauges = computed(() => {
    const values = this.store.snapshot();
    return GAUGES.map((gauge) => {
      const raw = values[gauge.key];
      const { value, unit } = CONVERT[gauge.key]?.(raw ?? 0, this.units()) ?? {
        value: raw ?? 0,
        unit: gauge.unit,
      };
      // Bar and psi are too coarse without decimals.
      const digits = unit === 'bar' ? 2 : unit === 'psi' ? 1 : gauge.digits;
      return { ...gauge, unit, text: raw === null ? '–' : value.toFixed(digits) };
    });
  });
}
