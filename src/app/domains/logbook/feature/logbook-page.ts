import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { saveFile } from '@core/device';
import { TranslatePipe, TranslateService } from '@core/i18n';
import { UnitsStore } from '@core/units';
import { consumptionIn, distanceIn, volumeIn } from '@shared/kernel/units';
import { SheetPage } from '@shared/ui/sheet-page';
import { LogbookStore } from '../application/logbook.store';
import { Trip, monthOf, summarize, toCsv } from '../domain/trip';

const CSV_COLUMNS = [
  'date',
  'start',
  'end',
  'from',
  'to',
  'km',
  'minutes',
  'litres',
  'cost',
  'per100',
  'eco',
];

@Component({
  selector: 'app-logbook-page',
  imports: [RouterLink, SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet-page section="logbook" [title]="'logbook.title' | translate">
      @if (store.current(); as trip) {
        <div class="m live" data-section-test="logbook-live">
          <small
            ><i class="ti ti-steering-wheel" aria-hidden="true"></i
            >{{ 'logbook.live' | translate: { time: time(trip.startedAt) } }}</small
          >
          <b>{{ km(trip.distanceKm) }} · {{ duration(trip) }}</b>
          <small>
            {{ litres(trip.fuelL) }} · {{ trip.cost.toFixed(2) }} ·
            <span [class]="rating(trip.score)">{{ trip.score }}</span>
            {{ 'logbook.eco_points' | translate }}
          </small>
        </div>
      }
      @if (store.loaded() && !store.trips().length) {
        <div class="empty" data-section-test="logbook-empty">
          <i class="ti ti-route" aria-hidden="true"></i>
          <p>{{ 'logbook.empty' | translate }}</p>
        </div>
      }
      @if (store.trips().length) {
        <div class="row">
          @for (item of months(); track item) {
            <button
              class="btn"
              type="button"
              [attr.data-section-test]="'logbook-month-' + item"
              [class.pri]="item === month()"
              (click)="chosenMonth.set(item)"
            >
              {{ monthName(item) }}
            </button>
          }
        </div>
        <div class="grid summary">
          <div class="m">
            <small>{{ 'logbook.trips' | translate }}</small>
            <b data-section-test="logbook-count">{{ summary().count }}</b>
          </div>
          <div class="m">
            <small>{{ 'logbook.distance' | translate }}</small>
            <b data-section-test="logbook-distance">{{ km(summary().distanceKm, 0) }}</b>
          </div>
          <div class="m">
            <small>{{ 'logbook.fuel' | translate }}</small>
            <b data-section-test="logbook-fuel">{{ litres(summary().fuelL) }}</b>
          </div>
          <div class="m">
            <small>{{ 'logbook.cost' | translate }}</small>
            <b data-section-test="logbook-cost">{{ summary().cost.toFixed(2) }}</b>
          </div>
          <div class="m">
            <small>{{ 'logbook.consumption' | translate }}</small>
            <b>{{ consumption(summary().per100Km) }}</b>
          </div>
          <div class="m">
            <small>{{ 'logbook.eco_average' | translate }}</small>
            <b>{{ summary().score ?? '–' }}</b>
          </div>
        </div>
      }
      <ul>
        @for (trip of trips(); track trip.id) {
          <li class="m" [attr.data-section-test]="'logbook-trip-' + trip.id">
            <div>
              <small>{{ date(trip.startedAt) }}</small>
              <b
                >{{ trip.from || ('logbook.start' | translate) }} →
                {{ trip.to || ('logbook.end' | translate) }}</b
              >
              <small>
                {{ km(trip.distanceKm) }} · {{ duration(trip) }} · {{ litres(trip.fuelL) }} ·
                {{ trip.cost.toFixed(2) }} ·
                <span [class]="rating(trip.score)">{{ trip.score }}</span>
                {{ 'logbook.eco_points' | translate }}
              </small>
              @if (events(trip); as text) {
                <small data-section-test="logbook-events">{{ text }}</small>
              }
            </div>
            @if (trip.stats) {
              <a
                class="btn"
                [attr.data-section-test]="'logbook-values-' + trip.id"
                [routerLink]="['/chart']"
                [queryParams]="{ trip: trip.id }"
                [attr.aria-label]="'logbook.values' | translate"
              >
                <i class="ti ti-chart-line" aria-hidden="true"></i>
              </a>
            }
            @if (trip.path.length > 1) {
              <button
                class="btn"
                type="button"
                [attr.data-section-test]="'logbook-map-' + trip.id"
                [attr.aria-label]="'logbook.show' | translate"
                (click)="show(trip)"
              >
                <i class="ti ti-map-2" aria-hidden="true"></i>
              </button>
            }
            <button
              class="btn"
              type="button"
              [attr.data-section-test]="'logbook-delete-' + trip.id"
              [class.sure]="sure() === trip.id"
              [attr.aria-label]="
                (sure() === trip.id ? 'logbook.delete_sure' : 'logbook.delete') | translate
              "
              (click)="remove(trip)"
            >
              <i class="ti ti-trash" aria-hidden="true"></i>
            </button>
          </li>
        }
      </ul>
      @if (sure()) {
        <p class="hint" role="status">{{ 'logbook.delete_sure' | translate }}</p>
      }
      @if (store.trips().length) {
        <button class="btn" type="button" data-section-test="logbook-export" (click)="export()">
          <i class="ti ti-download" aria-hidden="true"></i>{{ 'logbook.export' | translate }}
        </button>
      }
      <p class="hint">{{ 'logbook.note' | translate }}</p>
    </app-sheet-page>
  `,
  styles: `
    ul {
      list-style: none;
      display: grid;
      gap: 10px;
      margin: 12px 0;
    }
    .summary,
    .live {
      margin: 12px 0;
    }
    li {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    li div {
      flex: 1;
      min-width: 0;
    }
    li b {
      font-size: 16px;
    }
    li span,
    .live span {
      font-weight: 700;
      margin: 0;
    }
    .btn:not(.pri) {
      background: var(--p3);
    }
    a.btn {
      color: inherit;
      text-decoration: none;
    }
    .btn.sure {
      background: var(--ba);
      color: #fff;
    }
    .good {
      color: var(--ok);
    }
    .fair {
      color: var(--wa);
    }
    .poor {
      color: var(--ba);
    }
    .hint {
      color: var(--s);
      font-size: 14px;
      margin: 10px 0;
    }
  `,
})
export class LogbookPage {
  protected readonly store = inject(LogbookStore);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly units = inject(UnitsStore).units;

  protected readonly chosenMonth = signal('');
  /** The second tap deletes. */
  protected readonly sure = signal(0);
  protected readonly months = computed(() => [...new Set(this.store.trips().map(monthOf))]);
  protected readonly month = computed(() => {
    const months = this.months();
    return months.includes(this.chosenMonth()) ? this.chosenMonth() : (months[0] ?? '');
  });
  protected readonly trips = computed(() =>
    this.store.trips().filter((trip) => monthOf(trip) === this.month()),
  );
  protected readonly summary = computed(() => summarize(this.trips()));

  constructor() {
    void this.store.load();
  }

  protected km(value: number, digits = 1): string {
    const { value: converted, unit } = distanceIn(value, this.units());
    return `${converted.toFixed(digits)} ${unit}`;
  }

  protected litres(value: number): string {
    const { value: converted, unit } = volumeIn(value, this.units());
    return `${converted.toFixed(1)} ${unit}`;
  }

  protected consumption(value: number | null): string {
    if (value === null) return '–';
    const { value: converted, unit } = consumptionIn(value, this.units());
    return `${converted.toFixed(1)} ${unit}`;
  }

  protected duration({ startedAt, endedAt }: Trip): string {
    const minutes = Math.max(1, Math.round((endedAt - startedAt) / 60_000));
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }

  protected rating(score: number): string {
    return score >= 80 ? 'good' : score >= 60 ? 'fair' : 'poor';
  }

  protected events({ driving: d }: Trip): string {
    const parts: string[] = [];
    const add = (key: string, n: number) =>
      parts.push(this.translate.translate('logbook.event.' + key, { n }) ?? key);
    if (d.hardAccelerations) add('accelerate', d.hardAccelerations);
    if (d.hardBrakings) add('brake', d.hardBrakings);
    if (d.highRpmSeconds > 5) add('rpm', Math.round(d.highRpmSeconds));
    if (d.idleSeconds > 30) add('idle', Math.max(1, Math.round(d.idleSeconds / 60)));
    return parts.join(' · ');
  }

  protected show(trip: Trip): void {
    if (this.store.showOnMap(trip)) void this.router.navigateByUrl('/');
  }

  protected remove(trip: Trip): void {
    if (this.sure() !== trip.id) {
      this.sure.set(trip.id);
      setTimeout(() => this.sure.set(0), 4000);
      return;
    }
    this.sure.set(0);
    void this.store.delete(trip.id);
  }

  protected export(): void {
    const header = CSV_COLUMNS.map((key) => this.translate.translate('logbook.csv.' + key) ?? key);
    // The mark makes spreadsheets read it as UTF-8.
    const text = '\ufeff' + toCsv(this.store.trips(), header);
    void saveFile('codrivemate-logbook.csv', new Blob([text], { type: 'text/csv' }));
  }

  protected monthName(month: string): string {
    const [year, number] = month.split('-').map(Number);
    return new Date(year, number - 1, 1).toLocaleDateString(this.translate.lang, {
      month: 'long',
      year: 'numeric',
    });
  }

  protected time(at: number): string {
    return new Date(at).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  }

  protected date(at: number): string {
    return new Date(at).toLocaleString(this.translate.lang, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }
}
