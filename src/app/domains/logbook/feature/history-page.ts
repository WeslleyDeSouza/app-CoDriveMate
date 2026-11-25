import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@core/i18n';
import { UnitsStore } from '@core/units';
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  ChartFrame,
  LiveChart,
  SERIES,
  Series,
  seriesText,
  seriesUnit,
} from '@domains/telemetry';
import { consumptionIn } from '@shared/kernel/units';
import { SheetPage } from '@shared/ui/sheet-page';
import { LogbookStore } from '../application/logbook.store';
import { Trip, summarize } from '../domain/trip';
import {
  Period,
  TripValues,
  ValueStats,
  periodRange,
  trendPaths,
  tripPath,
} from '../domain/trip-values';

type View = 'live' | Period;
const VIEWS: readonly View[] = ['live', 'day', 'week', 'month'];
/** The line of the drive going on is redrawn this often. */
const RELOAD_MS = 5000;

/** Measured values: live, of one drive, or drive by drive over a day, week or month. */
@Component({
  selector: 'app-history-page',
  imports: [ChartFrame, LiveChart, SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet-page section="chart" [title]="'telemetry.chart.title' | translate">
      <div class="row">
        @for (item of views; track item) {
          <button
            class="btn"
            type="button"
            [attr.data-section-test]="'chart-view-' + item"
            [class.pri]="item === view()"
            [attr.aria-pressed]="item === view()"
            (click)="show(item)"
          >
            {{ 'logbook.history.view.' + item | translate }}
          </button>
        }
      </div>
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

      @if (view() === 'live') {
        <app-live-chart [series]="selected()" />
      } @else {
        <div class="head">
          @if (trip(); as one) {
            <button
              class="btn"
              type="button"
              data-section-test="chart-back"
              (click)="chosen.set(0)"
            >
              <i class="ti ti-chevron-left" aria-hidden="true"></i>
              {{ 'logbook.history.all' | translate }}
            </button>
            <b data-section-test="chart-title-trip">{{ name(one) }}</b>
          } @else {
            <button
              class="btn"
              type="button"
              data-section-test="chart-earlier"
              [attr.aria-label]="'logbook.history.earlier' | translate"
              (click)="back.set(back() + 1)"
            >
              <i class="ti ti-chevron-left" aria-hidden="true"></i>
            </button>
            <b data-section-test="chart-period">{{ periodName() }}</b>
            <button
              class="btn"
              type="button"
              data-section-test="chart-later"
              [disabled]="!back()"
              [attr.aria-label]="'logbook.history.later' | translate"
              (click)="back.set(back() - 1)"
            >
              <i class="ti ti-chevron-right" aria-hidden="true"></i>
            </button>
          }
        </div>
        <div class="numbers" data-section-test="chart-numbers">
          @for (number of numbers(); track number.key) {
            <span>
              <small>{{ 'logbook.history.' + number.key | translate }}</small>
              <b>{{ number.text }}</b>
            </span>
          }
        </div>
        @if (paths().line) {
          <app-chart-frame
            [series]="selected()"
            [line]="paths().line"
            [bars]="paths().bars"
            [label]="'telemetry.chart.series.' + selected().key | translate"
          />
          <div class="ends">
            <span>{{ ends()[0] }}</span><span>{{ ends()[1] }}</span>
          </div>
        } @else {
          <p class="hint" data-section-test="chart-hint">
            {{ 'logbook.history.' + missing() | translate }}
          </p>
        }
        @if (!trip()) {
          <ul>
            @for (item of trips(); track item.id) {
              <li>
                <button
                  class="btn"
                  type="button"
                  [attr.data-section-test]="'chart-trip-' + item.id"
                  (click)="chosen.set(item.id)"
                >
                  <span>{{ name(item) }}</span>
                  <b>{{ value(item) }}</b>
                </button>
              </li>
            }
          </ul>
        }
      }
    </app-sheet-page>
  `,
  styles: `
    .row {
      margin-bottom: 10px;
    }
    .btn:not(.pri) {
      background: var(--p3);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin: 14px 0 8px;
    }
    .numbers {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 22px;
      margin-bottom: 10px;

      small {
        display: block;
        color: var(--s);
        font-size: 13px;
      }
      b {
        font-size: 20px;
        font-variant-numeric: tabular-nums;
      }
    }
    .ends {
      display: flex;
      justify-content: space-between;
      color: var(--s);
      font-size: 13px;
      padding: 4px 0 0 48px;
    }
    .hint {
      color: var(--s);
      font-size: 15px;
      margin: 20px 0;
    }
    ul {
      list-style: none;
      display: grid;
      gap: 8px;
      margin: 14px 0;
      padding: 0;
    }
    li .btn {
      width: 100%;
      min-height: var(--touch);
      display: flex;
      justify-content: space-between;
      gap: 12px;
      text-align: left;
    }
  `,
})
export class HistoryPage {
  private readonly store = inject(LogbookStore);
  private readonly translate = inject(TranslateService);
  private readonly units = inject(UnitsStore).units;

  protected readonly views = VIEWS;
  protected readonly series = SERIES;
  protected readonly selected = signal<Series>(SERIES[0]);
  protected readonly view = signal<View>('live');
  protected readonly back = signal(0);
  /** id of the trip shown alone, 0 for all of the period */
  protected readonly chosen = signal(0);
  private readonly values = signal<TripValues | null>(null);
  private readonly now = Date.now();

  protected readonly trip = computed(() => this.all().find(({ id }) => id === this.chosen()));
  /** Newest first, with the drive going on. */
  private readonly all = computed(() => {
    const current = this.store.current();
    const trips = this.store.trips();
    return current ? [current, ...trips.filter(({ id }) => id !== current.id)] : trips;
  });
  private readonly range = computed(() => {
    const view = this.view();
    return periodRange(view === 'live' ? 'day' : view, this.back(), this.now);
  });
  protected readonly trips = computed(() => {
    const [from, to] = this.range();
    return this.all().filter(({ startedAt }) => startedAt >= from && startedAt < to);
  });
  private readonly running = computed(() => {
    const current = this.store.current();
    return !!current && current.id === this.chosen();
  });

  protected readonly paths = computed(() => {
    const { min, max, key } = this.selected();
    const scale = { min, max, width: CHART_WIDTH, height: CHART_HEIGHT };
    if (this.chosen()) {
      const values = this.values();
      return { line: values ? tripPath(values, key, scale) : '', bars: '' };
    }
    const ordered = [...this.trips()].reverse();
    return trendPaths(
      ordered.map((trip) => trip.stats?.[key] ?? null),
      scale,
    );
  });
  protected readonly missing = computed(() => {
    if (!this.chosen()) return this.trips().length ? 'not_measured' : 'empty';
    return this.trip()?.stats?.[this.selected().key] ? 'only_stats' : 'not_measured';
  });

  protected readonly numbers = computed(() => {
    const one = this.trip();
    const trips = one ? [one] : this.trips();
    const { key } = this.selected();
    const found = trips.flatMap((trip) => {
      const stats = trip.stats?.[key];
      // Long drives count more.
      return stats ? [{ stats, weight: Math.max(1, trip.endedAt - trip.startedAt) }] : [];
    });
    const numbers: { key: string; text: string }[] = [];
    if (found.length) {
      const weight = found.reduce((sum, item) => sum + item.weight, 0);
      const average = found.reduce((sum, item) => sum + item.stats.average * item.weight, 0);
      numbers.push(
        { key: 'average', text: this.text(average / weight) },
        { key: 'min', text: this.text(Math.min(...found.map(({ stats }) => stats.min))) },
        { key: 'max', text: this.text(Math.max(...found.map(({ stats }) => stats.max))) },
      );
    }
    const { per100Km } = summarize(trips);
    if (key === 'consumption' && per100Km !== null) {
      const { value, unit } = consumptionIn(per100Km, this.units());
      numbers.unshift({ key: 'per_distance', text: `${value.toFixed(1)} ${unit}` });
    }
    return numbers;
  });

  protected readonly periodName = computed(() => {
    const [from, to] = this.range();
    const { lang } = this.translate;
    const day = (at: number) =>
      new Date(at).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
    if (this.view() === 'month') {
      return new Date(from).toLocaleDateString(lang, { month: 'long', year: 'numeric' });
    }
    return this.view() === 'week' ? `${day(from)} – ${day(to - 1)}` : day(from);
  });
  protected readonly ends = computed(() => {
    const trip = this.trip();
    if (trip) return [this.time(trip.startedAt), this.time(trip.endedAt)];
    const trips = this.trips();
    return trips.length > 1
      ? [this.date(trips[trips.length - 1].startedAt), this.date(trips[0].startedAt)]
      : ['', ''];
  });

  constructor() {
    const address = Number(inject(ActivatedRoute).snapshot.queryParamMap.get('trip')) || 0;
    void this.store.load().then(() => this.openFromAddress(address));
    effect((onCleanup) => {
      const id = this.chosen();
      const running = this.running();
      let stale = false;
      untracked(() => this.values.set(null));
      onCleanup(() => (stale = true));
      if (!id) return;
      const load = () =>
        void this.store.valuesOf(id).then((values) => {
          if (!stale) this.values.set(values);
        });
      untracked(load);
      if (!running) return;
      const timer = setInterval(load, RELOAD_MS);
      onCleanup(() => clearInterval(timer));
    });
  }

  protected show(view: View): void {
    this.chosen.set(0);
    this.back.set(0);
    this.view.set(view);
  }

  protected name(trip: Trip): string {
    if (trip.id === this.store.current()?.id) {
      return this.translate.translate('logbook.live', { time: this.time(trip.startedAt) }) ?? '';
    }
    const places = [trip.from, trip.to].filter(Boolean).join(' → ');
    return [this.date(trip.startedAt), places].filter(Boolean).join(' · ');
  }

  protected value(trip: Trip): string {
    const stats: ValueStats | undefined = trip.stats?.[this.selected().key];
    return stats ? 'Ø ' + this.text(stats.average) : '–';
  }

  private openFromAddress(id: number): void {
    if (!id || !this.all().some((trip) => trip.id === id)) return;
    this.view.set('month');
    const now = new Date(this.now);
    const at = new Date(id);
    // So that "all drives" leads to the month of this one.
    const months = (date: Date) => date.getFullYear() * 12 + date.getMonth();
    this.back.set(Math.max(0, months(now) - months(at)));
    this.chosen.set(id);
  }

  private text(value: number): string {
    const series = this.selected();
    return `${seriesText(series, value, this.units())} ${seriesUnit(series, this.units())}`;
  }

  private time(at: number): string {
    return new Date(at).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  }

  private date(at: number): string {
    return new Date(at).toLocaleString(this.translate.lang, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
