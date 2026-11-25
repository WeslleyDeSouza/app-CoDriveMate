import { EnvironmentProviders, Provider, inject, provideAppInitializer } from '@angular/core';
import { LEGACY_MIGRATIONS } from '@core/storage';
import { SettingsStore } from './application/settings.store';
import { SettingsRepository } from './domain/settings';
import {
  IdbSettingsRepository,
  settingsLegacyMigration,
} from './infrastructure/idb-settings.repository';

export function provideSettings(): (Provider | EnvironmentProviders)[] {
  return [
    { provide: SettingsRepository, useClass: IdbSettingsRepository },
    { provide: LEGACY_MIGRATIONS, useValue: settingsLegacyMigration, multi: true },
    // Settings (theme, vehicle) are needed before the first paint.
    provideAppInitializer(() => inject(SettingsStore).load()),
  ];
}
