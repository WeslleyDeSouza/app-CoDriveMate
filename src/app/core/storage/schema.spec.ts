import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { DB_NAME, KV_STORE, openAppDb } from './schema';

describe('database schema', () => {
  beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the trips and settings of version 1', async () => {
    const old = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('kv');
        db.createObjectStore('trips', { keyPath: 'id' });
        const cache = db.createObjectStore('cache', { keyPath: ['bucket', 'key'] });
        cache.createIndex('by-bucket-updated', ['bucket', 'updatedAt']);
      },
    });
    await old.put('trips', { id: 1, distanceKm: 5 });
    await old.put('kv', 'x', 'settings');
    old.close();

    const db = await openAppDb();
    expect(await db.getAll('trips')).toEqual([{ id: 1, distanceKm: 5 }]);
    expect(await db.get(KV_STORE, 'settings')).toBe('x');
    expect(await db.getAll('trip-values')).toEqual([]);
    db.close();
  });
});
