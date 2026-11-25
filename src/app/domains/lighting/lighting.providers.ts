import { EnvironmentProviders, Provider, inject, provideAppInitializer } from '@angular/core';
import { LEGACY_MIGRATIONS } from '@core/storage';
import { LightStore } from './application/light.store';
import { LightModule, LightRepository } from './domain/lighting';
import {
  BleLightModule,
  IdbLightRepository,
  lightingLegacyMigration,
} from './infrastructure/ble-light.module';

export function provideLighting(): (Provider | EnvironmentProviders)[] {
  return [
    { provide: LightModule, useClass: BleLightModule },
    { provide: LightRepository, useClass: IdbLightRepository },
    { provide: LEGACY_MIGRATIONS, useValue: lightingLegacyMigration, multi: true },
    // A known module is connected at start, beside everything else.
    provideAppInitializer(() => void inject(LightStore).start()),
  ];
}
