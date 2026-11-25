import { Injectable, inject } from '@angular/core';
import { Collections, LegacyMigration } from '@core/storage';
import { LegacyTrip, Trip, TripRepository, tripFromLegacy } from '../domain/trip';
import { TripValues } from '../domain/trip-values';

@Injectable()
export class IdbTripRepository extends TripRepository {
  private readonly trips = inject(Collections).of<Trip>('trips');
  private readonly measured = inject(Collections).of<TripValues>('trip-values');

  all(): Promise<Trip[]> {
    return this.trips.all();
  }

  save(trip: Trip): Promise<void> {
    return this.trips.put(trip);
  }

  async delete(id: number): Promise<void> {
    await this.trips.delete(id);
    await this.measured.delete(id);
  }

  async values(id: number): Promise<TripValues | null> {
    return (await this.measured.get(id)) ?? null;
  }

  saveValues(values: TripValues): Promise<void> {
    return this.measured.put(values);
  }

  async pruneValues(before: number): Promise<void> {
    const old = (await this.measured.keys()).filter((id) => id < before);
    for (const id of old) await this.measured.delete(id);
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
