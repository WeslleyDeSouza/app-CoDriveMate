import { Injectable, inject } from '@angular/core';
import { KeyValueStore, LegacyMigration } from '@core/storage';
import {
  LegacyParking,
  ParkingRepository,
  ParkingSpot,
  parkingFromLegacy,
} from '../domain/parking';

const KEY = 'parking';

@Injectable()
export class IdbParkingRepository extends ParkingRepository {
  private readonly kv = inject(KeyValueStore);

  load(): Promise<ParkingSpot | undefined> {
    return this.kv.get<ParkingSpot>(KEY);
  }

  save(spot: ParkingSpot | null): Promise<void> {
    return spot ? this.kv.set(KEY, spot) : this.kv.delete(KEY);
  }
}

/** Imports the prototype's parking spot (`pd_park`). */
export const parkingLegacyMigration: LegacyMigration = {
  id: 'parking-v1',
  async migrate({ source, kv }) {
    const legacy = source.localJson<LegacyParking>('pd_park');
    const spot = legacy && parkingFromLegacy(legacy);
    if (spot && (await kv.get(KEY)) === undefined) await kv.set(KEY, spot);
  },
};
