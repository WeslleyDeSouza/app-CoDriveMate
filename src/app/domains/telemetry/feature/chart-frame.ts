import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { UnitsStore } from '@core/units';
import { Series } from '../domain/history';
import { seriesText } from './series-format';

export const CHART_WIDTH = 600;
export const CHART_HEIGHT = 300;
const LINES = [0, 0.25, 0.5, 0.75, 1];

/** Scale and grid of a chart; `line` and `bars` are SVG path data. */
@Component({
  selector: 'app-chart-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scale" aria-hidden="true">
      @for (label of labels(); track $index) {
        <span>{{ label }}</span>
      }
    </div>
    <svg
      [attr.viewBox]="'0 0 ' + width + ' ' + height"
      preserveAspectRatio="none"
      role="img"
      [attr.aria-label]="label()"
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
      @if (bars()) {
        <path
          class="bars"
          data-section-test="chart-bars"
          [attr.d]="bars()"
          [attr.stroke]="series().color"
          vector-effect="non-scaling-stroke"
        />
      }
      <path
        data-section-test="chart-line"
        [attr.d]="line()"
        [attr.stroke]="series().color"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  `,
  styles: `
    :host {
      display: flex;
      gap: 8px;
      height: min(40vh, 340px);
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
      stroke-linecap: round;
    }
    .bars {
      stroke-width: 8;
      opacity: 0.35;
    }
  `,
})
export class ChartFrame {
  readonly series = input.required<Series>();
  readonly label = input('');
  readonly line = input('');
  readonly bars = input('');

  private readonly units = inject(UnitsStore).units;
  protected readonly width = CHART_WIDTH;
  protected readonly height = CHART_HEIGHT;
  protected readonly lines = LINES;
  protected readonly labels = computed(() => {
    const { min, max } = this.series();
    return LINES.map((share) => seriesText(this.series(), max - (max - min) * share, this.units()));
  });
}
