import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { UnitsStore } from '@core/units';
import { speedIn } from '@shared/kernel/units';
import { TelemetryStore } from '../application/telemetry.store';
import { gaugeAngle, gaugeArc, gaugePoint, gaugeTicks } from '../domain/gauge';
import { speeding } from '../domain/speeding';

const MAX = { 'km/h': 220, mph: 140 } as Record<string, number>;
const STEP = 10;
const SPEED_RADIUS = 92;
const RPM_RADIUS = 52;

/** Round speedometer with a needle, revs on the inner arc and the gear. */
@Component({
  selector: 'app-speed-gauge',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'panel' },
  template: `
    <svg
      viewBox="-104 -104 208 190"
      role="img"
      data-section-test="gauge"
      [class]="level() ?? ''"
      [attr.aria-label]="('telemetry.gauge' | translate) + ': ' + speed() + ' ' + unit()"
    >
      <path class="track" [attr.d]="track" />
      <path class="lit" data-section-test="gauge-arc" [attr.d]="arc()" />
      @for (tick of ticks(); track tick.deg) {
        <line
          class="tick"
          [class.major]="tick.label !== null"
          x1="0"
          x2="0"
          y1="-86"
          [attr.y2]="tick.label === null ? -81 : -76"
          [attr.transform]="'rotate(' + tick.deg + ')'"
        />
        @if (tick.label !== null) {
          <text class="num" [attr.x]="tick.x" [attr.y]="tick.y">{{ tick.label }}</text>
        }
      }
      @if (limitMark(); as mark) {
        <circle
          class="limit"
          r="5"
          data-section-test="gauge-limit"
          [attr.cx]="mark.x"
          [attr.cy]="mark.y"
        />
      }
      <path class="rpm" [attr.d]="rpmTrack" />
      <path class="rpm red" [attr.d]="rpmRed()" />
      <path class="rpm on" [class.high]="revving()" [attr.d]="rpmArc()" />
      <g class="needle" data-section-test="gauge-needle" [style.transform]="needle()">
        <path d="M-2.6 12 L-0.9 -80 L0.9 -80 L2.6 12Z" />
      </g>
      <circle class="hub" r="25" />
      <text class="gear" y="-3" data-section-test="gauge-gear">{{ gear() }}</text>
      <text class="cap" y="14">{{ 'telemetry.gauge_gear' | translate }}</text>
      <text class="digits" y="58" data-section-test="gauge-speed">{{ speed() }}</text>
      <text class="cap" y="74">{{ unit() }}</text>
    </svg>
    <div class="gears" aria-hidden="true">
      @for (name of gears(); track name) {
        <span [class.on]="name === gear()">{{ name }}</span>
      }
    </div>
  `,
  styleUrl: './speed-gauge.scss',
})
export class SpeedGauge {
  private readonly store = inject(TelemetryStore);
  private readonly units = inject(UnitsStore).units;
  readonly limitKmh = input<number | null>(null);

  private readonly shown = computed(() => speedIn(this.store.snapshot().speed, this.units()));
  private readonly max = computed(() => MAX[this.shown().unit] ?? 220);

  protected readonly speed = computed(() => Math.round(this.shown().value));
  protected readonly unit = computed(() => this.shown().unit);
  protected readonly level = computed(() => speeding(this.store.snapshot().speed, this.limitKmh()));
  protected readonly needle = computed(
    () => `rotate(${gaugeAngle(this.shown().value, this.max())}deg)`,
  );
  protected readonly ticks = computed(() => gaugeTicks(this.max(), STEP, 66));
  protected readonly track = gaugeArc(0, 1, 1, SPEED_RADIUS);
  protected readonly arc = computed(() =>
    gaugeArc(0, this.shown().value, this.max(), SPEED_RADIUS),
  );
  protected readonly limitMark = computed(() => {
    const limit = this.limitKmh();
    if (limit === null) return null;
    return gaugePoint(gaugeAngle(speedIn(limit, this.units()).value, this.max()), SPEED_RADIUS);
  });

  protected readonly rpmTrack = gaugeArc(0, 1, 1, RPM_RADIUS);
  protected readonly rpmArc = computed(() =>
    gaugeArc(0, this.store.snapshot().rpm, this.store.profile().maxRpm, RPM_RADIUS),
  );
  protected readonly rpmRed = computed(() => {
    const { maxRpm, redlineRpm } = this.store.profile();
    return gaugeArc(redlineRpm, maxRpm, maxRpm, RPM_RADIUS);
  });
  protected readonly revving = computed(
    () => this.store.snapshot().rpm >= this.store.profile().redlineRpm,
  );

  protected readonly gear = computed(() => {
    const gear = this.store.gear();
    return gear === null ? '–' : gear === 0 ? 'N' : String(gear);
  });
  protected readonly gears = computed(() => [
    'N',
    ...this.store.profile().gearRatios.map((_, i) => String(i + 1)),
  ]);
}
