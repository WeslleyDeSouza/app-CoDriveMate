import { Provider } from '@angular/core';
import { LEGACY_MIGRATIONS } from '@core/storage';
import { CarParkSource } from './domain/handover';
import { OsmCarParkSource } from './infrastructure/osm-car-park.source';
import { ParkingRepository } from './domain/parking';
import {
  IdbParkingRepository,
  parkingLegacyMigration,
} from './infrastructure/idb-parking.repository';

export function provideParking(): Provider[] {
  return [
    { provide: ParkingRepository, useClass: IdbParkingRepository },
    { provide: CarParkSource, useClass: OsmCarParkSource },
    { provide: LEGACY_MIGRATIONS, useValue: parkingLegacyMigration, multi: true },
  ];
}
