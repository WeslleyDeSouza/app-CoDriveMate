import { Provider } from '@angular/core';
import { ASSISTANT_TOOLS } from '@core/assistant';
import { LEGACY_MIGRATIONS } from '@core/storage';
import { fuelTool } from './application/fuel.tools';
import { StationSource } from './domain/stations';
import { TankRepository } from './domain/tank';
import { IdbTankRepository, fuelLegacyMigration } from './infrastructure/idb-tank.repository';
import { OsmStationSource } from './infrastructure/osm-station.source';

export function provideFuel(): Provider[] {
  return [
    { provide: TankRepository, useClass: IdbTankRepository },
    { provide: StationSource, useClass: OsmStationSource },
    { provide: LEGACY_MIGRATIONS, useValue: fuelLegacyMigration, multi: true },
    { provide: ASSISTANT_TOOLS, useFactory: fuelTool, multi: true },
  ];
}
