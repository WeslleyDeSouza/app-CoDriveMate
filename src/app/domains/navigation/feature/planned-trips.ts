import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@core/i18n';
import { NavigationStore } from '../application/navigation.store';
import { PlannedTripsStore } from '../application/planned-trips.store';
import { PlannedTrip, TripWhen, whenOf } from '../domain/planned-trips';
import { TripForm } from './trip-form';

/**
 * Destinations saved for later: planned for a day, kept for any day, favourites.
 * Shown in the search on the map and in the logbook.
 */
@Component({
  selector: 'app-planned-trips',
  imports: [TranslatePipe, TripForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (trip of shown(); track trip.id) {
      @if (editing() === trip.id) {
        <app-trip-form [place]="trip.place" [trip]="trip" (closed)="editing.set(null)" />
      } @else {
        <div class="trip" [class]="'when-' + when(trip)">
          <button
            class="go"
            type="button"
            [attr.data-section-test]="'trip-go-' + trip.id"
            [disabled]="navigation.busy() || starting()"
            (click)="go(trip)"
          >
            <i
              class="ti"
              [class]="trip.favourite ? 'ti-star-filled' : trip.day ? 'ti-calendar-event' : 'ti-bookmark'"
              aria-hidden="true"
            ></i>
            <span>
              <b>{{ trip.topic || trip.place.name }}</b>
              <small>
                {{ dayText(trip) }}{{ trip.topic ? ' · ' + trip.place.name : '' }}
              </small>
              @if (trip.note) {
                <small class="note">{{ trip.note }}</small>
              }
            </span>
          </button>
          <button
            type="button"
            class="icon"
            [attr.data-section-test]="'trip-edit-' + trip.id"
            [attr.aria-label]="'navigation.change' | translate"
            (click)="editing.set(trip.id)"
          >
            <i class="ti ti-pencil" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            class="icon"
            [class.sure]="sure() === trip.id"
            [attr.data-section-test]="'trip-remove-' + trip.id"
            [attr.aria-label]="
              (sure() === trip.id ? 'navigation.plan.remove_sure' : 'navigation.remove') | translate
            "
            (click)="remove(trip)"
          >
            <i class="ti" [class]="sure() === trip.id ? 'ti-trash' : 'ti-x'" aria-hidden="true"></i>
          </button>
        </div>
      }
    } @empty {
      @if (!soon()) {
        <div class="empty" data-section-test="trips-empty">
          <i class="ti ti-calendar-event" aria-hidden="true"></i>
          <p>{{ 'navigation.plan.empty' | translate }}</p>
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
    }
    .trip {
      display: flex;
      align-items: center;
    }
    .go {
      display: flex;
      gap: 10px;
      align-items: center;
      flex: 1;
      min-width: 0;
      min-height: 56px;
      text-align: left;
      border: 0;
      background: none;
      padding: 8px;
      border-radius: 12px;
      i {
        color: var(--a);
        font-size: 20px;
      }
      span {
        min-width: 0;
        flex: 1;
      }
      b {
        font-weight: 600;
      }
      small {
        display: block;
        color: var(--s);
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
    .when-today .go small:first-of-type {
      color: var(--ok);
      font-weight: 600;
    }
    .when-past {
      opacity: 0.6;
    }
    .icon {
      width: var(--touch);
      height: var(--touch);
      border: 0;
      background: none;
      color: var(--s);
      font-size: 18px;
      flex: none;
      &.sure {
        color: var(--ba);
      }
    }
  `,
})
export class PlannedTrips {
  protected readonly navigation = inject(NavigationStore);
  private readonly store = inject(PlannedTripsStore);
  private readonly translate = inject(TranslateService);

  /** Only what is due today or later, as in the search on the map. */
  readonly soon = input(false);
  /** A route was started. */
  readonly started = output<void>();

  protected readonly editing = signal<string | null>(null);
  protected readonly sure = signal<string | null>(null);
  protected readonly starting = signal(false);
  protected readonly shown = computed(() => {
    const today = this.store.today();
    const trips = this.store.trips();
    return this.soon()
      ? trips.filter((trip) => ['today', 'upcoming'].includes(whenOf(trip, today)))
      : trips;
  });

  constructor() {
    void this.store.load();
  }

  protected when(trip: PlannedTrip): TripWhen {
    return whenOf(trip, this.store.today());
  }

  protected dayText(trip: PlannedTrip): string {
    const when = this.when(trip);
    if (when === 'today' || when === 'anytime') return this.t('navigation.plan.when.' + when);
    const date = new Date(`${trip.day}T12:00:00`);
    const lang = this.translate.lang === 'de' ? 'de-CH' : this.translate.lang;
    return date.toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  protected async go(trip: PlannedTrip): Promise<void> {
    this.starting.set(true);
    const started = await this.store.go(trip).finally(() => this.starting.set(false));
    if (started) this.started.emit();
  }

  /** The second tap removes it. */
  protected remove(trip: PlannedTrip): void {
    if (this.sure() !== trip.id) return this.sure.set(trip.id);
    this.sure.set(null);
    void this.store.remove(trip.id);
  }

  private t(key: string): string {
    return this.translate.translate(key) ?? key;
  }
}
