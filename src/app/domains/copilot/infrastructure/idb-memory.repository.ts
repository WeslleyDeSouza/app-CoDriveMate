import { Injectable, inject } from '@angular/core';
import { KeyValueStore } from '@core/storage';
import { DriverMemory, MemoryRepository, readMemory } from '../domain/memory';

const MEMORY_KEY = 'copilot/memory';

@Injectable()
export class IdbMemoryRepository extends MemoryRepository {
  private readonly kv = inject(KeyValueStore);

  async load(): Promise<DriverMemory> {
    return readMemory(await this.kv.get<Partial<DriverMemory>>(MEMORY_KEY));
  }

  save(memory: DriverMemory): Promise<void> {
    return this.kv.set(MEMORY_KEY, memory);
  }
}
