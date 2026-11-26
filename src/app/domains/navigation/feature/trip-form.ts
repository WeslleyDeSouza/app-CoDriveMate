import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { PlannedTripsStore } from '../application/planned-trips.store';
import { MAX_NOTE, MAX_TOPIC, PlannedTrip } from '../domain/planned-trips';
import { SavedPlace } from '../domain/saved-places';

/** Topic, note, day and favourite of a destination saved for later. Filled in while standing. */
@Component({
  selector: 'app-trip-form',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="panel" (submit)="$event.preventDefault(); save()">
      <p class="where">
        <i class="ti ti-map-pin" aria-hidden="true"></i>
        <span
          ><b>{{ place().name }}</b><small>{{ place().detail }}</small></span
        >
      </p>
      <label class="f">
        {{ 'navigation.plan.topic' | translate }}
        <input
          #topic
          type="text"
          enterkeyhint="next"
          data-section-test="trip-topic"
          [maxLength]="maxTopic"
          [placeholder]="'navigation.plan.topic_hint' | translate"
          [value]="trip()?.topic ?? ''"
        />
      </label>
      <label class="f">
        {{ 'navigation.plan.note' | translate }}
        <textarea
          #note
          rows="3"
          data-section-test="trip-note"
          [maxLength]="maxNote"
          [placeholder]="'navigation.plan.note_hint' | translate"
          [value]="trip()?.note ?? ''"
        ></textarea>
      </label>
      <label class="f">
        {{ 'navigation.plan.day' | translate }}
        <input #day type="date" data-section-test="trip-day" [value]="trip()?.day ?? ''" />
      </label>
      <button
        type="button"
        class="btn fav"
        data-section-test="trip-favourite"
        [class.on]="favourite()"
        [attr.aria-pressed]="favourite()"
        (click)="favourite.set(!favourite())"
      >
        <i class="ti" [class]="favourite() ? 'ti-star-filled' : 'ti-star'" aria-hidden="true"></i>
        {{ 'navigation.plan.favourite' | translate }}
      </button>
      <p class="hint">{{ 'navigation.plan.privacy' | translate }}</p>
      <div class="row">
        <button class="btn pri" type="submit" data-section-test="trip-save">
          <i class="ti ti-check" aria-hidden="true"></i>{{ 'navigation.plan.save' | translate }}
        </button>
        <button class="btn" type="button" data-section-test="trip-cancel" (click)="closed.emit()">
          {{ 'navigation.plan.cancel' | translate }}
        </button>
      </div>
    </form>
  `,
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px;
      margin-bottom: 8px;
    }
    .where {
      display: flex;
      gap: 10px;
      align-items: center;
      margin: 0;
      i {
        color: var(--a);
        font-size: 20px;
      }
      b {
        font-weight: 600;
      }
      small {
        display: block;
        color: var(--s);
        font-size: 12px;
      }
    }
    textarea {
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--ln);
      background: var(--p2);
      color: var(--t);
      font: inherit;
      font-size: 15px;
      resize: vertical;
    }
    .fav {
      align-self: flex-start;
      i {
        font-size: 20px;
      }
      &.on i {
        color: var(--wa);
      }
    }
    .hint {
      margin: 0;
      font-size: 12px;
      color: var(--s);
    }
  `,
})
export class TripForm implements OnInit {
  private readonly store = inject(PlannedTripsStore);
  readonly place = input.required<SavedPlace>();
  /** the trip being changed; none for a new one */
  readonly trip = input<PlannedTrip | null>(null);
  readonly closed = output<void>();
  readonly saved = output<PlannedTrip>();

  protected readonly maxTopic = MAX_TOPIC;
  protected readonly maxNote = MAX_NOTE;
  protected readonly favourite = signal(false);
  private readonly topic = viewChild.required<ElementRef<HTMLInputElement>>('topic');
  private readonly note = viewChild.required<ElementRef<HTMLTextAreaElement>>('note');
  private readonly day = viewChild.required<ElementRef<HTMLInputElement>>('day');

  ngOnInit(): void {
    this.favourite.set(this.trip()?.favourite ?? false);
  }

  protected async save(): Promise<void> {
    const trip = await this.store.save({
      id: this.trip()?.id,
      place: this.place(),
      topic: this.topic().nativeElement.value,
      note: this.note().nativeElement.value,
      day: this.day().nativeElement.value,
      favourite: this.favourite(),
    });
    if (trip) this.saved.emit(trip);
    this.closed.emit();
  }
}
