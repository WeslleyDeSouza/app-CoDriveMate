import { Provider } from '@angular/core';
import { Trip, TripRepository } from './domain/trip';
import { TripValues } from './domain/trip-values';

export class FakeTripRepository extends TripRepository {
  trips: Trip[] = [];

  async all(): Promise<Trip[]> {
    return this.trips;
  }
  async save(trip: Trip): Promise<void> {
    this.trips = [...this.trips.filter(({ id }) => id !== trip.id), trip];
  }
  async delete(id: number): Promise<void> {
    this.trips = this.trips.filter((trip) => trip.id !== id);
    this.measured.delete(id);
  }

  readonly measured = new Map<number, TripValues>();
  async values(id: number): Promise<TripValues | null> {
    return this.measured.get(id) ?? null;
  }
  async saveValues(values: TripValues): Promise<void> {
    this.measured.set(values.id, values);
  }
  async pruneValues(before: number): Promise<void> {
    for (const id of this.measured.keys()) if (id < before) this.measured.delete(id);
  }
}

export function logbookTesting() {
  const repository = new FakeTripRepository();
  const providers: Provider[] = [{ provide: TripRepository, useValue: repository }];
  return { repository, providers };
}
