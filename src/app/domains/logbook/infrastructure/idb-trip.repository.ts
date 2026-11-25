import { Injectable, inject } from '@angular/core';
import { Collections, LegacyMigration } from '@core/storage';
import { LegacyTrip, Trip, TripRepository, tripFromLegacy } from '../domain/trip';

@Injectable()
export class IdbTripRepository extends TripRepository {
  private readonly trips = inject(Collections).of<Trip>('trips');

  all(): Promise<Trip[]> {
    return this.trips.all();
  }

  save(trip: Trip): Promise<void> {
    return this.trips.put(trip);
  }

  delete(id: number): Promise<void> {
    return this.trips.delete(id);
  }
}

/** Imports the trips the prototype recorded into IndexedDB `picasso-drive`. */
export const logbookLegacyMigration: LegacyMigration = {
  id: 'logbook-v1',
  async migrate({ source, collection }) {
    const legacy = await source.idbAll<LegacyTrip>('trip');
    const trips = legacy.filter((trip) => typeof trip?.id === 'number').map(tripFromLegacy);
    if (trips.length) await collection<Trip>('trips').putAll(trips);
  },
};
