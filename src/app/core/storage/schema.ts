import { IDBPDatabase, openDB } from 'idb';

/**
 * IndexedDB schema of the app. One database for everything persistent and all
 * caches. To change it: raise DB_VERSION and add a step in `upgrade` — never
 * edit an existing step, users already have that version on their device.
 */
export const DB_NAME = 'codrivemate';
export const DB_VERSION = 2;

/** Single documents and settings, addressed by string key. */
export const KV_STORE = 'kv';
/** Cached, re-creatable data (tiles, areas, TTS audio, API responses). */
export const CACHE_STORE = 'cache';
export const CACHE_BY_BUCKET_AGE = 'by-bucket-updated';

/** Document collections; every record carries its own `id`. */
export const COLLECTIONS = ['trips', 'trip-values'] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export type AppDb = IDBPDatabase<unknown>;

export function openAppDb(): Promise<AppDb> {
  return openDB(DB_NAME, DB_VERSION, {
    // Another open tab must not keep the new version waiting.
    blocking: (_current, _blocked, event) => (event.target as IDBDatabase | null)?.close(),
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore(KV_STORE);
        db.createObjectStore('trips', { keyPath: 'id' });
        const cache = db.createObjectStore(CACHE_STORE, { keyPath: ['bucket', 'key'] });
        cache.createIndex(CACHE_BY_BUCKET_AGE, ['bucket', 'updatedAt']);
      }
      if (oldVersion < 2) db.createObjectStore('trip-values', { keyPath: 'id' });
    },
  });
}
