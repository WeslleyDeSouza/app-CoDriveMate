import { Injectable, inject } from '@angular/core';
import { KeyValueStore } from '@core/storage';
import { DataKind, ReadingRepository, SavedReading, SavedReadings } from '../domain/readings';

const KEY = 'selftest/readings';

/** The last reading per module, in IndexedDB (`kv`); part of the backup. */
@Injectable()
export class IdbReadingRepository extends ReadingRepository {
  private readonly kv = inject(KeyValueStore);

  async load(): Promise<SavedReadings> {
    return (await this.kv.get<SavedReadings>(KEY)) ?? {};
  }

  async save(kind: DataKind, reading: SavedReading): Promise<void> {
    const saved = await this.load();
    await this.kv.set(KEY, { ...saved, [kind]: reading });
  }
}
