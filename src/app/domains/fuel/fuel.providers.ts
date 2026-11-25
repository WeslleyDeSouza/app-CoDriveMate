import { Provider } from '@angular/core';
import { LEGACY_MIGRATIONS } from '@core/storage';
import { StationSource } from './domain/stations';
import { TankRepository } from './domain/tank';
import { IdbTankRepository, fuelLegacyMigration } from './infrastructure/idb-tank.repository';
import { OsmStationSource } from './infrastructure/osm-station.source';

export function provideFuel(): Provider[] {
  return [
    { provide: TankRepository, useClass: IdbTankRepository },
    { provide: StationSource, useClass: OsmStationSource },
    { provide: LEGACY_MIGRATIONS, useValue: fuelLegacyMigration, multi: true },
  ];
}
