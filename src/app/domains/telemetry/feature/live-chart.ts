import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { UnitsStore } from '@core/units';
import { HistoryStore } from '../application/history.store';
import { Series, pathOf } from '../domain/history';
import { CHART_HEIGHT, CHART_WIDTH, ChartFrame } from './chart-frame';
import { seriesText, seriesUnit } from './series-format';

/** One value over the last two minutes. */
@Component({
  selector: 'app-live-chart',
  imports: [ChartFrame, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="now" data-section-test="chart-value" [style.color]="series().color">
      {{ now() }} <small>{{ unit() }}</small>
    </p>
    <app-chart-frame
      [series]="series()"
      [line]="path()"
      [label]="'telemetry.chart.series.' + series().key | translate"
    />
    <p class="hint" data-section-test="chart-hint">
      {{ (path() ? 'telemetry.chart.span' : 'telemetry.chart.empty') | translate }}
    </p>
  `,
  styles: `
    .now {
      font-size: 40px;
      font-weight: 600;
      margin: 14px 0 8px;
      font-variant-numeric: tabular-nums;

      small {
        font-size: 16px;
        color: var(--s);
      }
    }
    .hint {
      color: var(--s);
      font-size: 14px;
      margin-top: 10px;
    }
  `,
})
export class LiveChart {
  readonly series = input.required<Series>();
  private readonly store = inject(HistoryStore);
  private readonly units = inject(UnitsStore).units;

  protected readonly path = computed(() =>
    pathOf(this.store.samples(), this.series(), CHART_WIDTH, CHART_HEIGHT),
  );
  protected readonly now = computed(() => {
    const samples = this.store.samples();
    const value = samples[samples.length - 1]?.[this.series().key] ?? null;
    return value === null ? '–' : seriesText(this.series(), value, this.units());
  });
  protected readonly unit = computed(() => seriesUnit(this.series(), this.units()));
}
