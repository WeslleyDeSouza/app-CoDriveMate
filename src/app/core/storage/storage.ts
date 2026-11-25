import { Injectable, inject } from '@angular/core';
import { LEGACY_MIGRATIONS, runLegacyMigrations } from './legacy-migration';
import { AppDb, COLLECTIONS, CollectionName, openAppDb } from './schema';
import { CacheAccess, CollectionAccess, KeyValueAccess } from './stores';

/**
 * Opens the database once and runs the legacy migrations before anyone reads
 * from it. Everything that touches IndexedDB goes through `ready()`.
 */
@Injectable({ providedIn: 'root' })
export class AppDatabase {
  private readonly migrations = (inject(LEGACY_MIGRATIONS, { optional: true }) ?? []).flat();
  private opened?: Promise<AppDb>;

  ready(): Promise<AppDb> {
    this.opened ??= this.open();
    return this.opened;
  }

  private async open(): Promise<AppDb> {
    const db = await openAppDb();
    await runLegacyMigrations(db, this.migrations);
    // Ask the browser not to evict our data under storage pressure.
    void globalThis.navigator?.storage?.persist?.().catch(() => false);
    return db;
  }
}

@Injectable({ providedIn: 'root' })
export class KeyValueStore extends KeyValueAccess {
  constructor() {
    const database = inject(AppDatabase);
    super(() => database.ready());
  }
}

@Injectable({ providedIn: 'root' })
export class CacheStore extends CacheAccess {
  constructor() {
    const database = inject(AppDatabase);
    super(() => database.ready());
  }
}

@Injectable({ providedIn: 'root' })
export class Collections {
  private readonly database = inject(AppDatabase);

  of<T extends { id: IDBValidKey }>(name: CollectionName): CollectionAccess<T> {
    return new CollectionAccess<T>(() => this.database.ready(), name);
  }
}

export interface BackupFile {
  app: 'codrivemate';
  version: 1;
  exportedAt: string;
  kv: Record<string, unknown>;
  collections: Partial<Record<CollectionName, unknown[]>>;
}

/**
 * Export and import of all persistent data (not the cache). This is the way
 * data moves between origins, e.g. from the web version into the native app.
 * The file contains the settings, including any API keys stored there.
 */
@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly kv = inject(KeyValueStore);
  private readonly collections = inject(Collections);

  async export(): Promise<BackupFile> {
    const kv = Object.fromEntries(
      (await this.kv.entries()).filter(([key]) => !key.startsWith('meta/')),
    );
    const collections: BackupFile['collections'] = {};
    for (const name of COLLECTIONS) collections[name] = await this.collections.of(name).all();
    return {
      app: 'codrivemate',
      version: 1,
      exportedAt: new Date().toISOString(),
      kv,
      collections,
    };
  }

  /** Merges a backup into the database; records with the same key are replaced. */
  async import(file: BackupFile): Promise<void> {
    if (file?.app !== 'codrivemate' || file.version !== 1) {
      throw new Error('Not a CoDriveMate backup file.');
    }
    for (const [key, value] of Object.entries(file.kv ?? {})) {
      if (!key.startsWith('meta/')) await this.kv.set(key, value);
    }
    for (const name of COLLECTIONS) {
      const docs = (file.collections?.[name] ?? []) as { id: IDBValidKey }[];
      await this.collections.of(name).putAll(docs.filter((doc) => doc?.id !== undefined));
    }
  }
}
