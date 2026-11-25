import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { UnitsStore } from '@core/units';
import { Quantity, Units, fuelRateIn, speedIn, temperatureIn } from '@shared/kernel/units';
import { SheetPage } from '@shared/ui/sheet-page';
import { HistoryStore } from '../application/history.store';
import { SERIES, Series, SeriesKey, pathOf } from '../domain/history';

const WIDTH = 600;
const HEIGHT = 300;
const LINES = [0, 0.25, 0.5, 0.75, 1];

const CONVERT: Partial<Record<SeriesKey, (value: number, units: Units) => Quantity>> = {
  speed: speedIn,
  coolantTemp: temperatureIn,
  consumption: fuelRateIn,
};
const UNIT: Partial<Record<SeriesKey, string>> = { rpm: '1/min', throttle: '%', voltage: 'V' };

/** One value over the last two minutes. */
@Component({
  selector: 'app-chart-page',
  imports: [SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet-page section="chart" [title]="'telemetry.chart.title' | translate">
      <div class="row">
        @for (item of series; track item.key) {
          <button
            class="btn"
            type="button"
            [attr.data-section-test]="'chart-series-' + item.key"
            [class.pri]="item.key === selected().key"
            [attr.aria-pressed]="item.key === selected().key"
            (click)="selected.set(item)"
          >
            {{ 'telemetry.chart.series.' + item.key | translate }}
          </button>
        }
      </div>
      <p class="now" data-section-test="chart-value" [style.color]="selected().color">
        {{ now() }} <small>{{ unit() }}</small>
      </p>
      <div class="plot">
        <div class="scale" aria-hidden="true">
          @for (label of labels(); track $index) {
            <span>{{ label }}</span>
          }
        </div>
        <svg
          [attr.viewBox]="'0 0 ' + width + ' ' + height"
          preserveAspectRatio="none"
          role="img"
          [attr.aria-label]="'telemetry.chart.series.' + selected().key | translate"
        >
          @for (line of lines; track line) {
            <line
              x1="0"
              [attr.x2]="width"
              [attr.y1]="line * height"
              [attr.y2]="line * height"
              vector-effect="non-scaling-stroke"
            />
          }
          <path
            data-section-test="chart-line"
            [attr.d]="path()"
            [attr.stroke]="selected().color"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      </div>
      <p class="hint" data-section-test="chart-hint">
        {{ (empty() ? 'telemetry.chart.empty' : 'telemetry.chart.span') | translate }}
      </p>
    </app-sheet-page>
  `,
  styles: `
    .btn:not(.pri) {
      background: var(--p3);
    }
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
    .plot {
      display: flex;
      gap: 8px;
      height: min(46vh, 340px);
    }
    .scale {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-size: 13px;
      color: var(--s);
      min-width: 40px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    svg {
      flex: 1;
      min-width: 0;
      height: 100%;
    }
    line {
      stroke: var(--ln);
    }
    path {
      fill: none;
      stroke-width: 3;
      stroke-linejoin: round;
    }
    .hint {
      color: var(--s);
      font-size: 14px;
      margin-top: 10px;
    }
  `,
})
export class ChartPage {
  private readonly store = inject(HistoryStore);
  private readonly units = inject(UnitsStore).units;
  protected readonly series = SERIES;
  protected readonly selected = signal<Series>(SERIES[0]);
  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly lines = LINES;

  protected readonly path = computed(() =>
    pathOf(this.store.samples(), this.selected(), WIDTH, HEIGHT),
  );
  protected readonly empty = computed(() => !this.path());
  protected readonly now = computed(() => {
    const samples = this.store.samples();
    const value = samples[samples.length - 1]?.[this.selected().key] ?? null;
    return value === null ? '–' : this.text(value);
  });
  protected readonly unit = computed(() => {
    const { key } = this.selected();
    return CONVERT[key]?.(0, this.units()).unit ?? UNIT[key] ?? '';
  });
  protected readonly labels = computed(() => {
    const { min, max } = this.selected();
    return LINES.map((share) => this.text(max - (max - min) * share));
  });

  private text(value: number): string {
    const { key, digits } = this.selected();
    return (CONVERT[key]?.(value, this.units()).value ?? value).toFixed(digits);
  }
}
