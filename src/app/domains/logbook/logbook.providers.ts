import { Provider } from '@angular/core';
import { LEGACY_MIGRATIONS } from '@core/storage';
import { TripRepository } from './domain/trip';
import { IdbTripRepository, logbookLegacyMigration } from './infrastructure/idb-trip.repository';

export function provideLogbook(): Provider[] {
  return [
    { provide: TripRepository, useClass: IdbTripRepository },
    { provide: LEGACY_MIGRATIONS, useValue: logbookLegacyMigration, multi: true },
  ];
}
