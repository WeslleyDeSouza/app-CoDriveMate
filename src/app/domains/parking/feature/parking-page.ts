import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@core/i18n';
import { UnitsStore } from '@core/units';
import { NavigationStore, PositionStore, distanceM } from '@domains/navigation';
import { formatDistanceIn } from '@shared/kernel/units';
import { SheetPage } from '@shared/ui/sheet-page';
import { ParkingStore } from '../application/parking.store';
import { CarPark } from '../domain/handover';
import { METER_MINUTES } from '../domain/parking';
import { ParkingQr } from './parking-qr';

@Component({
  selector: 'app-parking-page',
  imports: [ParkingQr, SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet-page section="parking" [title]="'parking.title' | translate">
      @if (spot(); as s) {
        <div class="m">
          <small
            ><i class="ti ti-parking" aria-hidden="true"></i>{{ 'parking.here' | translate }}</small
          >
          <b data-section-test="parking-where">{{ s.where }}</b>
          <small data-section-test="parking-since">
            {{ 'parking.since' | translate: { time: s.time, date: s.date } }}
            @if (s.distance) {
              · {{ 'parking.away' | translate: { distance: s.distance } }}
            }
          </small>
        </div>
        <div class="row actions">
          <button class="btn pri" type="button" data-section-test="parking-guide" (click)="guide()">
            <i class="ti ti-navigation" aria-hidden="true"></i>{{ 'parking.guide' | translate }}
          </button>
          <button class="btn" type="button" data-section-test="parking-show" (click)="show()">
            <i class="ti ti-map-2" aria-hidden="true"></i>{{ 'parking.show' | translate }}
          </button>
        </div>

        <details class="qr">
          <summary data-section-test="parking-phone">
            <i class="ti ti-qrcode" aria-hidden="true"></i>{{ 'parking.phone' | translate }}
          </summary>
          <app-parking-qr [at]="s.at" />
        </details>

        <h3 class="sec-title">{{ 'parking.meter' | translate }}</h3>
        <p
          class="timer"
          data-section-test="parking-timer"
          [class.soon]="left() !== null && left()! <= 10"
        >
          @if (left() === null) {
            {{ 'parking.no_meter' | translate }}
          } @else if (left()! > 0) {
            {{ 'parking.left' | translate: { time: leftText(), until: s.until } }}
          } @else {
            {{ 'parking.expired' | translate: { until: s.until } }}
          }
        </p>
        <div class="row">
          @for (minutes of meterMinutes; track minutes) {
            <button
              class="btn"
              type="button"
              [attr.data-section-test]="'parking-meter-' + minutes"
              (click)="store.setMeter(minutes)"
            >
              {{ meterText(minutes) }}
            </button>
          }
          <button
            class="btn"
            type="button"
            data-section-test="parking-meter-off"
            (click)="store.setMeter(0)"
          >
            {{ 'parking.off' | translate }}
          </button>
        </div>
        <p class="hint" data-section-test="parking-hint">
          {{ (store.silent() ? 'parking.hint_silent' : 'parking.hint') | translate }}
        </p>

        <label class="f">
          {{ 'parking.note' | translate }}
          <input
            type="text"
            data-section-test="parking-note"
            [value]="s.note"
            [placeholder]="'parking.note_hint' | translate"
            (change)="store.setNote($any($event.target).value.trim())"
          />
        </label>
        <div class="row actions">
          <button class="btn" type="button" data-section-test="parking-here" (click)="park()">
            <i class="ti ti-map-pin" aria-hidden="true"></i>{{ 'parking.park_again' | translate }}
          </button>
          <button
            class="btn"
            type="button"
            data-section-test="parking-delete"
            (click)="store.clear()"
          >
            <i class="ti ti-trash" aria-hidden="true"></i>{{ 'parking.delete' | translate }}
          </button>
        </div>
      } @else {
        <div class="empty">
          <i class="ti ti-parking" aria-hidden="true"></i>
          <p>{{ 'parking.none' | translate }}</p>
          <button class="btn pri" type="button" data-section-test="parking-here" (click)="park()">
            <i class="ti ti-map-pin" aria-hidden="true"></i>{{ 'parking.park_here' | translate }}
          </button>
        </div>
      }
      <h3 class="sec-title">{{ 'parking.find' | translate }}</h3>
      <button
        class="btn"
        type="button"
        data-section-test="parking-find"
        (click)="store.findCarParks()"
      >
        <i class="ti ti-search" aria-hidden="true"></i>
        {{ (hasRoute() ? 'parking.find_destination' : 'parking.find_near') | translate }}
      </button>
      @if (store.search().state !== 'idle' && store.search().state !== 'done') {
        <p class="hint" role="status" data-section-test="parking-find-state">
          {{ 'parking.find_state.' + store.search().state | translate }}
        </p>
      }
      <ul>
        @for (park of store.search().parks; track park.id) {
          <li>
            <button
              class="btn park"
              type="button"
              [attr.data-section-test]="'parking-park-' + $index"
              (click)="go(park)"
            >
              <i class="ti ti-navigation" aria-hidden="true"></i>
              <span>
                <b>{{ park.name || ('parking.car_park' | translate) }}</b>
                <small
                  >{{ away(park.distanceM) }} {{ park.address ? '· ' + park.address : '' }}</small
                >
              </span>
            </button>
          </li>
        }
      </ul>
      @if (noPosition()) {
        <p class="hint" role="status" data-section-test="parking-no-position">
          {{ 'parking.no_position' | translate }}
        </p>
      }
    </app-sheet-page>
  `,
  styles: `
    .actions {
      margin: 12px 0;
    }
    .timer {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 10px;
    }
    .soon {
      color: var(--ba);
    }
    .hint {
      color: var(--s);
      font-size: 14px;
      margin: 10px 0 16px;
    }
    .qr {
      margin: 12px 0;

      summary {
        min-height: var(--touch);
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 16px;
        cursor: pointer;
      }
    }
    ul {
      list-style: none;
      display: grid;
      gap: 8px;
      margin: 10px 0;
    }
    .park {
      width: 100%;
      min-height: 60px;
      text-align: left;

      small {
        display: block;
        color: var(--s);
      }
    }
    .btn:not(.pri) {
      background: var(--p3);
    }
  `,
})
export class ParkingPage {
  protected readonly store = inject(ParkingStore);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly positions = inject(PositionStore);
  private readonly navigation = inject(NavigationStore);
  private readonly units = inject(UnitsStore).units;
  protected readonly meterMinutes = METER_MINUTES;
  protected readonly hasRoute = computed(() => this.navigation.route() !== null);
  protected readonly noPosition = signal(false);
  protected readonly left = this.store.minutesLeft;

  protected readonly spot = computed(() => {
    const spot = this.store.spot();
    if (!spot) return null;
    const here = this.positions.position()?.coordinate;
    return {
      at: spot.at,
      where: spot.street || `${spot.at[1].toFixed(5)}, ${spot.at[0].toFixed(5)}`,
      time: this.time(spot.since),
      date: new Date(spot.since).toLocaleDateString(this.translate.lang),
      distance: here ? formatDistanceIn(distanceM(here, spot.at), this.units()) : '',
      note: spot.note,
      until: spot.until ? this.time(spot.until) : '',
    };
  });

  constructor() {
    void this.store.start();
  }

  protected away(metres: number): string {
    return formatDistanceIn(metres, this.units());
  }

  protected async go(park: CarPark): Promise<void> {
    if (await this.store.guideTo(park)) void this.router.navigateByUrl('/');
    else this.noPosition.set(!this.positions.position());
  }

  protected meterText(minutes: number): string {
    return minutes < 60 ? `${minutes} min` : `${minutes / 60} h`;
  }

  protected leftText(): string {
    const left = this.left() ?? 0;
    return left < 60 ? `${left} min` : `${Math.floor(left / 60)} h ${left % 60} min`;
  }

  protected async park(): Promise<void> {
    this.noPosition.set(!(await this.store.parkHere()));
  }

  protected show(): void {
    this.store.showOnMap();
    void this.router.navigateByUrl('/');
  }

  protected async guide(): Promise<void> {
    if (await this.store.guideBack()) void this.router.navigateByUrl('/');
    else this.noPosition.set(!this.positions.position());
  }

  private time(at: number): string {
    return new Date(at).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  }
}
