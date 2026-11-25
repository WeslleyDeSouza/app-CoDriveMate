import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { UnitsStore } from '@core/units';
import {
  consumptionIn,
  distanceIn,
  fuelRateIn,
  speedIn,
  temperatureIn,
} from '@shared/kernel/units';
import { TelemetryStore } from '../application/telemetry.store';

/** What other domains add to the panel. */
export interface CockpitExtras {
  readonly tripKm: number | null;
  readonly averageKmh: number | null;
  readonly rangeKm: number | null;
  readonly limitKmh: number | null;
  readonly levels: Partial<Record<'coolant' | 'battery' | 'range', 'warn' | 'crit'>>;
}

const NO_EXTRAS: CockpitExtras = {
  tripKm: null,
  averageKmh: null,
  rangeKm: null,
  limitKmh: null,
  levels: {},
};

const SEGMENTS = 36;
/** Share of the redline from which the rev bar turns to the warning colour. */
const WARN_FROM = 0.8;

/**
 * Left column of the cockpit: speed, rev bar and the live tiles. Projected
 * content (the 3D view) sits between the head and the tiles.
 */
@Component({
  selector: 'app-cockpit-panel',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cockpit-panel.html',
  styleUrl: './cockpit-panel.scss',
})
export class CockpitPanel {
  private readonly store = inject(TelemetryStore);
  readonly extras = input<CockpitExtras>(NO_EXTRAS);

  private readonly units = inject(UnitsStore).units;

  protected readonly mode = this.store.mode;
  protected readonly speed = computed(() => {
    const { value, unit } = speedIn(this.values().speed, this.units());
    return { value: Math.round(value), unit: unit.toUpperCase() };
  });
  protected readonly values = this.store.snapshot;
  protected readonly rateHz = this.store.rateHz;

  protected readonly segments = computed(() => {
    const { maxRpm, redlineRpm } = this.store.profile();
    const rpm = this.values().rpm;
    return Array.from({ length: SEGMENTS }, (_, i) => {
      const segmentRpm = ((i + 1) / SEGMENTS) * maxRpm;
      return {
        lit: rpm >= segmentRpm - maxRpm / SEGMENTS / 2 && rpm > 0,
        warn: segmentRpm >= redlineRpm * WARN_FROM,
        red: segmentRpm >= redlineRpm,
      };
    });
  });

  protected readonly gears = computed(() =>
    this.store.profile().gearRatios.map((_, i) => ({ name: String(i + 1), number: i + 1 })),
  );
  protected readonly gear = this.store.gear;
  protected readonly trip = computed(() => this.distance(this.extras().tripKm, 1));
  protected readonly range = computed(() => this.distance(this.extras().rangeKm, 0));
  protected readonly average = computed(() => {
    const kmh = this.extras().averageKmh;
    const { value, unit } = speedIn(kmh ?? 0, this.units());
    return { text: kmh === null ? '–' : value.toFixed(0), unit };
  });
  protected readonly limit = computed(() => {
    const kmh = this.extras().limitKmh;
    return kmh === null ? null : Math.round(speedIn(kmh, this.units()).value);
  });
  protected readonly tooFast = computed(() => {
    const limit = this.extras().limitKmh;
    return limit !== null && this.values().speed > limit + 3;
  });

  private distance(km: number | null, digits: number): { text: string; unit: string } {
    const { value, unit } = distanceIn(km ?? 0, this.units());
    return { text: km === null ? '–' : value.toFixed(digits), unit };
  }

  /** While driving consumption per distance, otherwise per hour. */
  protected readonly consumption = computed(() => {
    const per100 = this.store.consumptionPer100Km();
    const perHour = this.store.fuelRateLph();
    const { value, unit } =
      per100 !== null
        ? consumptionIn(per100, this.units())
        : fuelRateIn(perHour ?? 0, this.units());
    return { value: per100 === null && perHour === null ? '–' : value.toFixed(1), unit };
  });

  protected temperature(celsius: number | null): { text: string; unit: string } {
    const { value, unit } = temperatureIn(celsius ?? 0, this.units());
    return { text: celsius === null ? '–' : value.toFixed(0), unit };
  }

  protected fixed(value: number | null, digits = 0): string {
    return value === null ? '–' : value.toFixed(digits);
  }
}
