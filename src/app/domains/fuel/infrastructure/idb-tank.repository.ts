import { Injectable, inject } from '@angular/core';
import { KeyValueStore, LegacyMigration } from '@core/storage';
import { TankRepository, TankState, UNKNOWN_TANK } from '../domain/tank';

const KEY = 'fuel/tank';

@Injectable()
export class IdbTankRepository extends TankRepository {
  private readonly kv = inject(KeyValueStore);

  load(): Promise<TankState | undefined> {
    return this.kv.get<TankState>(KEY);
  }

  save(state: TankState): Promise<void> {
    return this.kv.set(KEY, state);
  }
}

/** Imports the prototype's counted tank level (`pd_tl`). */
export const fuelLegacyMigration: LegacyMigration = {
  id: 'fuel-v1',
  async migrate({ source, kv }) {
    const raw = source.localRaw('pd_tl');
    const litres = Number(raw);
    if (!raw || !Number.isFinite(litres) || (await kv.get(KEY)) !== undefined) return;
    await kv.set(KEY, { ...UNKNOWN_TANK, litres });
  },
};
