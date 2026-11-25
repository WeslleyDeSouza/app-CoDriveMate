import { Injectable, inject } from '@angular/core';
import { KeyValueStore, LegacyMigration } from '@core/storage';
import {
  LegacyMaintenance,
  MaintenancePlan,
  MaintenanceRepository,
  planFromLegacy,
} from '../domain/maintenance';

const PLAN_KEY = 'maintenance';

@Injectable()
export class IdbMaintenanceRepository extends MaintenanceRepository {
  private readonly kv = inject(KeyValueStore);

  load(): Promise<Partial<MaintenancePlan> | undefined> {
    return this.kv.get<Partial<MaintenancePlan>>(PLAN_KEY);
  }

  save(plan: MaintenancePlan): Promise<void> {
    return this.kv.set(PLAN_KEY, plan);
  }
}

/** Imports the prototype's maintenance data (`pd_maint`). */
export const maintenanceLegacyMigration: LegacyMigration = {
  id: 'maintenance-v1',
  async migrate({ source, kv }) {
    const legacy = source.localJson<LegacyMaintenance>('pd_maint');
    if (!legacy || (await kv.get(PLAN_KEY)) !== undefined) return;
    await kv.set(PLAN_KEY, planFromLegacy(legacy));
  },
};
