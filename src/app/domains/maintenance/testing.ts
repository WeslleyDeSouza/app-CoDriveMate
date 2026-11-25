import { Provider } from '@angular/core';
import { MaintenancePlan, MaintenanceRepository } from './domain/maintenance';

export class FakeMaintenanceRepository extends MaintenanceRepository {
  plan?: Partial<MaintenancePlan>;
  loadError?: Error;
  readonly saved: MaintenancePlan[] = [];

  async load(): Promise<Partial<MaintenancePlan> | undefined> {
    if (this.loadError) throw this.loadError;
    return this.plan;
  }
  async save(plan: MaintenancePlan): Promise<void> {
    this.plan = plan;
    this.saved.push(plan);
  }
}

export function maintenanceTesting() {
  const repository = new FakeMaintenanceRepository();
  const providers: Provider[] = [{ provide: MaintenanceRepository, useValue: repository }];
  return { repository, providers };
}
