import { InjectionToken } from '@angular/core';
import { openDB } from 'idb';
import { AppDb, CollectionName } from './schema';
import { CollectionAccess, KeyValueAccess } from './stores';

/**
 * Import of the data the single-file prototype left in the browser:
 * localStorage keys `pdrive2` and `pd_*`, and IndexedDB `picasso-drive`.
 * Each domain registers one migration; each runs exactly once and never
 * deletes its source, so the old page keeps working.
 */
export const LEGACY_IDB_NAME = 'picasso-drive';
const DONE_KEY = 'meta/legacy-migrations';
const RAW_PREFIX = 'legacy/';
const LEGACY_LOCAL_KEY = /^(pdrive2|pd_.+)$/;

export interface LegacySource {
  /** Parsed JSON value of a legacy localStorage key, undefined if absent or broken. */
  localJson<T>(key: string): T | undefined;
  /** Raw string of a legacy localStorage key. */
  localRaw(key: string): string | null;
  /** All records of an object store of the legacy IndexedDB (empty if absent). */
  idbAll<T>(store: string): Promise<T[]>;
}

export interface LegacyMigrationContext {
  readonly source: LegacySource;
  /** Write through these — injected stores would wait for this very migration. */
  readonly kv: KeyValueAccess;
  collection<T extends { id: IDBValidKey }>(name: CollectionName): CollectionAccess<T>;
}

export interface LegacyMigration {
  /** Stable id; a migration that ran is never run again. */
  readonly id: string;
  migrate(context: LegacyMigrationContext): Promise<void>;
}

export const LEGACY_MIGRATIONS = new InjectionToken<LegacyMigration[]>('LEGACY_MIGRATIONS');

function browserLegacySource(): LegacySource {
  const localRaw = (key: string): string | null => {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  return {
    localRaw,
    localJson<T>(key: string): T | undefined {
      const raw = localRaw(key);
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return undefined;
      }
    },
    async idbAll<T>(store: string): Promise<T[]> {
      try {
        // Opening without a version must not create the database: abort if it is new.
        const db = await openDB(LEGACY_IDB_NAME, undefined, {
          upgrade: (_db, _old, _new, tx) => {
            tx.done.catch(() => undefined);
            tx.abort();
          },
        });
        try {
          if (!db.objectStoreNames.contains(store)) return [];
          return (await db.getAll(store)) as T[];
        } finally {
          db.close();
        }
      } catch {
        return [];
      }
    },
  };
}

/** Keeps an untouched copy of every legacy localStorage value under `legacy/<key>`. */
async function snapshotLegacyLocalStorage(kv: KeyValueAccess): Promise<void> {
  let keys: string[];
  try {
    keys = Object.keys(globalThis.localStorage ?? {}).filter((key) => LEGACY_LOCAL_KEY.test(key));
  } catch {
    return;
  }
  for (const key of keys) {
    const raw = globalThis.localStorage.getItem(key);
    if (raw !== null) await kv.set(RAW_PREFIX + key, raw);
  }
}

export async function runLegacyMigrations(
  db: AppDb,
  migrations: readonly LegacyMigration[],
  source: LegacySource = browserLegacySource(),
): Promise<void> {
  const provider = () => Promise.resolve(db);
  const kv = new KeyValueAccess(provider);
  const done = new Set((await kv.get<string[]>(DONE_KEY)) ?? []);
  const context: LegacyMigrationContext = {
    source,
    kv,
    collection: (name) => new CollectionAccess(provider, name),
  };

  if (!done.has('raw-snapshot')) {
    await snapshotLegacyLocalStorage(kv);
    done.add('raw-snapshot');
  }
  for (const migration of migrations) {
    if (done.has(migration.id)) continue;
    try {
      await migration.migrate(context);
      done.add(migration.id);
    } catch (error) {
      // Not marked as done: retried on the next start, the source stays untouched.
      console.error(`Legacy migration "${migration.id}" failed`, error);
    }
  }
  await kv.set(DONE_KEY, [...done]);
}
