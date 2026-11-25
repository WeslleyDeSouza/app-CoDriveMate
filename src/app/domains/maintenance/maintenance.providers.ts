import { Provider } from '@angular/core';
import { LEGACY_MIGRATIONS } from '@core/storage';
import { MaintenanceRepository } from './domain/maintenance';
import {
  IdbMaintenanceRepository,
  maintenanceLegacyMigration,
} from './infrastructure/idb-maintenance.repository';

export function provideMaintenance(): Provider[] {
  return [
    { provide: MaintenanceRepository, useClass: IdbMaintenanceRepository },
    { provide: LEGACY_MIGRATIONS, useValue: maintenanceLegacyMigration, multi: true },
  ];
}
