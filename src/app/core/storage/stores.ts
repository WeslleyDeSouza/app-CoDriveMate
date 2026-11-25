import { AppDb, CACHE_BY_BUCKET_AGE, CACHE_STORE, CollectionName, KV_STORE } from './schema';

export type DbProvider = () => Promise<AppDb>;

/** Key-value access: settings and single documents. */
export class KeyValueAccess {
  constructor(private readonly db: DbProvider) {}

  async get<T>(key: string): Promise<T | undefined> {
    return (await this.db()).get(KV_STORE, key) as Promise<T | undefined>;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await (await this.db()).put(KV_STORE, value, key);
  }

  async delete(key: string): Promise<void> {
    await (await this.db()).delete(KV_STORE, key);
  }

  async entries(): Promise<[string, unknown][]> {
    const db = await this.db();
    const [keys, values] = await Promise.all([db.getAllKeys(KV_STORE), db.getAll(KV_STORE)]);
    return keys.map((key, i) => [String(key), values[i]]);
  }
}

/** A collection of documents that each carry an `id`. */
export class CollectionAccess<T extends { id: IDBValidKey }> {
  constructor(
    private readonly db: DbProvider,
    private readonly name: CollectionName,
  ) {}

  async all(): Promise<T[]> {
    return (await this.db()).getAll(this.name) as Promise<T[]>;
  }

  async get(id: T['id']): Promise<T | undefined> {
    return (await this.db()).get(this.name, id) as Promise<T | undefined>;
  }

  async put(doc: T): Promise<void> {
    await (await this.db()).put(this.name, doc);
  }

  async putAll(docs: readonly T[]): Promise<void> {
    const tx = (await this.db()).transaction(this.name, 'readwrite');
    await Promise.all([...docs.map((doc) => tx.store.put(doc)), tx.done]);
  }

  async delete(id: T['id']): Promise<void> {
    await (await this.db()).delete(this.name, id);
  }
}

interface CacheRecord {
  bucket: string;
  key: string;
  value: unknown;
  updatedAt: number;
  expiresAt?: number;
}

/**
 * Cache for data that can be fetched or computed again. Grouped in buckets
 * (e.g. 'tile', 'area', 'tts') that are pruned independently.
 */
export class CacheAccess {
  constructor(private readonly db: DbProvider) {}

  async get<T>(bucket: string, key: string): Promise<T | undefined> {
    const record = (await (await this.db()).get(CACHE_STORE, [bucket, key])) as
      CacheRecord | undefined;
    if (!record) return undefined;
    if (record.expiresAt !== undefined && record.expiresAt <= Date.now()) {
      await this.delete(bucket, key);
      return undefined;
    }
    return record.value as T;
  }

  async has(bucket: string, key: string): Promise<boolean> {
    return (await this.get(bucket, key)) !== undefined;
  }

  async put(bucket: string, key: string, value: unknown, ttlMs?: number): Promise<void> {
    const now = Date.now();
    const record: CacheRecord = { bucket, key, value, updatedAt: now };
    if (ttlMs !== undefined) record.expiresAt = now + ttlMs;
    await (await this.db()).put(CACHE_STORE, record);
  }

  async delete(bucket: string, key: string): Promise<void> {
    await (await this.db()).delete(CACHE_STORE, [bucket, key]);
  }

  /** Keeps the `maxEntries` most recently written records of a bucket. */
  async prune(bucket: string, maxEntries: number): Promise<number> {
    const tx = (await this.db()).transaction(CACHE_STORE, 'readwrite');
    const range = IDBKeyRange.bound([bucket, 0], [bucket, Number.MAX_SAFE_INTEGER]);
    const keys = await tx.store.index(CACHE_BY_BUCKET_AGE).getAllKeys(range);
    const surplus = keys.slice(0, Math.max(0, keys.length - maxEntries));
    await Promise.all([...surplus.map((key) => tx.store.delete(key)), tx.done]);
    return surplus.length;
  }

  async clear(bucket: string): Promise<number> {
    return this.prune(bucket, 0);
  }
}
