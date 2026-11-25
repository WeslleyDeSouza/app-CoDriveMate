import { Injectable, inject } from '@angular/core';
import { KeyValueStore, LegacyMigration } from '@core/storage';
import { LegacyConfig, settingsFromLegacy } from '../domain/legacy-settings';
import { AppSettings, DeepPartial, SettingsRepository } from '../domain/settings';

const SETTINGS_KEY = 'settings';

@Injectable()
export class IdbSettingsRepository extends SettingsRepository {
  private readonly kv = inject(KeyValueStore);

  load(): Promise<DeepPartial<AppSettings> | undefined> {
    return this.kv.get<DeepPartial<AppSettings>>(SETTINGS_KEY);
  }

  save(settings: AppSettings): Promise<void> {
    return this.kv.set(SETTINGS_KEY, settings);
  }
}

/** Imports the prototype's settings (`pdrive2`) and tank size (`pd_tsize`). */
export const settingsLegacyMigration: LegacyMigration = {
  id: 'settings-v1',
  async migrate({ source, kv }) {
    const legacy = source.localJson<LegacyConfig>('pdrive2');
    if (!legacy || (await kv.get(SETTINGS_KEY)) !== undefined) return;
    await kv.set(SETTINGS_KEY, settingsFromLegacy(legacy, source.localRaw('pd_tsize')));
  },
};
