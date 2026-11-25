import { Provider } from '@angular/core';
import { Trip, TripRepository } from './domain/trip';

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
  }
}

export function logbookTesting() {
  const repository = new FakeTripRepository();
  const providers: Provider[] = [{ provide: TripRepository, useValue: repository }];
  return { repository, providers };
}
