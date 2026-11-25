import 'fake-indexeddb/auto';
import { deleteDB, openDB } from 'idb';
import { LEGACY_IDB_NAME, LegacyMigration, runLegacyMigrations } from './legacy-migration';
import { AppDb, DB_NAME, openAppDb } from './schema';
import { CacheAccess, KeyValueAccess } from './stores';

describe('legacy migration and cache', () => {
  let db: AppDb;
  beforeEach(async () => {
    localStorage.clear();
    db = await openAppDb();
  });
  afterEach(async () => {
    db.close();
    await deleteDB(DB_NAME);
    await deleteDB(LEGACY_IDB_NAME);
  });

  const kv = () => new KeyValueAccess(() => Promise.resolve(db));
  const importTrips: LegacyMigration = {
    id: 'trips',
    async migrate({ source, collection }) {
      await collection<{ id: number }>('trips').putAll(await source.idbAll<{ id: number }>('trip'));
    },
  };

  it('imports once, snapshots raw values and keeps the source', async () => {
    localStorage.setItem('pd_maint', '{"km":5}');
    localStorage.setItem('foreign', 'x');
    const old = await openDB(LEGACY_IDB_NAME, 4, {
      upgrade: (d) => void d.createObjectStore('trip'),
    });
    await old.put('trip', { id: 7 }, 7);

    await runLegacyMigrations(db, [importTrips]);
    await db.delete('trips', 7);
    await runLegacyMigrations(db, [importTrips]);

    expect(await db.getAll('trips')).toEqual([]);
    expect(await kv().get('legacy/pd_maint')).toBe('{"km":5}');
    expect(await kv().get('legacy/foreign')).toBeUndefined();
    expect(localStorage.getItem('pd_maint')).toBe('{"km":5}');
    expect(await old.getAll('trip')).toEqual([{ id: 7 }]);
    old.close();
  });

  it('copies the trips of the prototype', async () => {
    const old = await openDB(LEGACY_IDB_NAME, 4, {
      upgrade: (d) => void d.createObjectStore('trip'),
    });
    await old.put('trip', { id: 7 }, 7);
    old.close();
    await runLegacyMigrations(db, [importTrips]);
    expect(await db.getAll('trips')).toEqual([{ id: 7 }]);
  });

  it('does not create the old database when there is none', async () => {
    await runLegacyMigrations(db, [importTrips]);
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain(LEGACY_IDB_NAME);
  });

  it('retries a failed migration', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let runs = 0;
    const flaky: LegacyMigration = {
      id: 'flaky',
      async migrate() {
        if (++runs === 1) throw new Error('first');
      },
    };
    await runLegacyMigrations(db, [flaky]);
    await runLegacyMigrations(db, [flaky]);
    await runLegacyMigrations(db, [flaky]);
    expect(runs).toBe(2);
    error.mockRestore();
  });

  it('prunes the oldest entries and honours expiry', async () => {
    const cache = new CacheAccess(() => Promise.resolve(db));
    const now = vi.spyOn(Date, 'now');
    for (let i = 1; i <= 3; i++) {
      now.mockReturnValue(i * 1000);
      await cache.put('tile', `t${i}`, i);
    }
    await cache.put('tts', 'a', 'audio', 500);
    expect(await cache.prune('tile', 2)).toBe(1);
    expect(await cache.has('tile', 't1')).toBe(false);
    expect(await cache.get('tile', 't3')).toBe(3);
    now.mockReturnValue(3600);
    expect(await cache.get('tts', 'a')).toBeUndefined();
    now.mockRestore();
  });
});
