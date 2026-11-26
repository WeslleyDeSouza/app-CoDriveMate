import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationRepository } from '../domain/ports';
import {
  PlannedTrip,
  cleanPurpose,
  dayOf,
  dueToday,
  favouriteTrips,
  isDay,
  sortedTrips,
  withTrip,
  withoutTrip,
} from '../domain/planned-trips';
import { SavedPlace } from '../domain/saved-places';
import { PlacesStore } from './places.store';

export interface TripDraft {
  /** set when an existing trip is changed */
  readonly id?: string;
  readonly place: SavedPlace;
  readonly topic: string;
  readonly note: string;
  /** `YYYY-MM-DD` or '' for any day */
  readonly day: string;
  readonly favourite: boolean;
}

/** Destinations saved for later, with a topic and a note. They stay on the device. */
@Injectable({ providedIn: 'root' })
export class PlannedTripsStore {
  private readonly repository = inject(NavigationRepository);
  private readonly places = inject(PlacesStore);
  private readonly _trips = signal<readonly PlannedTrip[]>([]);
  /** Raised whenever the list is looked at, so that "today" moves on at midnight. */
  private readonly _today = signal(dayOf(Date.now()));
  private loaded?: Promise<void>;

  readonly today = this._today.asReadonly();
  readonly trips = computed(() => sortedTrips(this._trips(), this._today()));
  readonly favourites = computed(() => favouriteTrips(this._trips()));

  load(): Promise<void> {
    this.refreshDay();
    this.loaded ??= this.repository
      .loadTrips()
      .then((trips) => this._trips.set(trips))
      .catch(() => undefined);
    return this.loaded;
  }

  /** Planned for today. */
  due(): PlannedTrip[] {
    this.refreshDay();
    return dueToday(this._trips(), this._today());
  }

  /** Saves a new trip or changes one; null if there is nothing to save. */
  async save(draft: TripDraft): Promise<PlannedTrip | null> {
    const { topic, note } = cleanPurpose(draft.topic, draft.note);
    const day = isDay(draft.day) ? draft.day : null;
    await this.load();
    const before = this._trips().find(({ id }) => id === draft.id);
    const trip: PlannedTrip = {
      id: before?.id ?? newId(),
      place: draft.place,
      topic,
      note,
      day,
      favourite: draft.favourite,
      createdAt: before?.createdAt ?? Date.now(),
    };
    await this.change((trips) => withTrip(trips, trip));
    return trip;
  }

  remove(id: string): Promise<void> {
    return this.change((trips) => withoutTrip(trips, id));
  }

  /** Starts the route; the conversation mode then knows what the drive is about. */
  go({ place, topic, note }: PlannedTrip): Promise<boolean> {
    return this.places.goSaved(place, { topic, note });
  }

  private refreshDay(): void {
    const today = dayOf(Date.now());
    if (today !== this._today()) this._today.set(today);
  }

  private async change(
    update: (trips: readonly PlannedTrip[]) => readonly PlannedTrip[],
  ): Promise<void> {
    await this.load();
    const next = update(this._trips());
    this._trips.set(next);
    await this.repository.saveTrips(next).catch((e: unknown) => console.warn(e));
  }
}

function newId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
