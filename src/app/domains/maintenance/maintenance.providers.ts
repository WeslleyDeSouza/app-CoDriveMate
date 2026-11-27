import { Provider } from '@angular/core';
import { ASSISTANT_TOOLS } from '@core/assistant';
import { LEGACY_MIGRATIONS } from '@core/storage';
import { maintenanceStatusTool } from './application/maintenance.tools';
import { MaintenanceRepository } from './domain/maintenance';
import {
  IdbMaintenanceRepository,
  maintenanceLegacyMigration,
} from './infrastructure/idb-maintenance.repository';

export function provideMaintenance(): Provider[] {
  return [
    { provide: MaintenanceRepository, useClass: IdbMaintenanceRepository },
    { provide: LEGACY_MIGRATIONS, useValue: maintenanceLegacyMigration, multi: true },
    { provide: ASSISTANT_TOOLS, useFactory: maintenanceStatusTool, multi: true },
  ];
}
