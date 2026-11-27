import { Provider } from '@angular/core';
import { ASSISTANT_TOOLS } from '@core/assistant';
import { LEGACY_MIGRATIONS } from '@core/storage';
import { parkingTimerTool, parkingTool } from './application/parking.tools';
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
    { provide: ASSISTANT_TOOLS, useFactory: parkingTool, multi: true },
    { provide: ASSISTANT_TOOLS, useFactory: parkingTimerTool, multi: true },
  ];
}
