import { Injectable, inject } from '@angular/core';
import { HttpPort } from '@core/http';
import { CacheStore } from '@core/storage';

export const OPEN_FREE_MAP = 'https://tiles.openfreemap.org';
/** Streets and buildings are complete here; also the zoom of the 3D view and of offline routes. */
export const DETAIL_ZOOM = 14;
/** Tiles of `DETAIL_ZOOM`. */
export const DETAIL_BUCKET = 'vector';
const OVERVIEW_BUCKET = 'vector-overview';
const ASSET_BUCKET = 'map-assets';
const LIMITS: Record<string, number> = {
  [DETAIL_BUCKET]: 4000,
  [OVERVIEW_BUCKET]: 1500,
  [ASSET_BUCKET]: 300,
};
const PRUNE_EVERY = 50;
const FRESH_MS = 14 * 86_400_000;
const INDEX_FRESH_MS = 6 * 3_600_000;
const INDEX_TIMEOUT_MS = 5000;
const INDEX_PATH = '/planet';
const TILE_PATH = /^\/planet\/[^/]+\/(\d+)\/(\d+)\/(\d+)\.pbf$/;

interface Cached<T> {
  readonly fetchedAt: number;
  readonly value: T;
}

/**
 * OpenFreeMap with a store on the device: vector tiles, style, icons and fonts
 * that were loaded once stay available without a network.
 */
@Injectable({ providedIn: 'root' })
export class OpenFreeMap {
  private readonly http = inject(HttpPort);
  private readonly cache = inject(CacheStore);
  private index?: { readonly at: number; readonly template: Promise<string> };
  private readonly writes = new Map<string, number>();

  /** A vector tile, null if it is neither stored nor reachable. */
  tile(z: number, x: number, y: number): Promise<ArrayBuffer | null> {
    const bucket = z === DETAIL_ZOOM ? DETAIL_BUCKET : OVERVIEW_BUCKET;
    return this.stored(bucket, `${z}/${x}/${y}`, async () => {
      const template = await this.template();
      const url = template
        .replace('{z}', String(z))
        .replace('{x}', String(x))
        .replace('{y}', String(y));
      return this.download(url);
    });
  }

  /** Style, icons, fonts and tiles by their address, null if not available. */
  async resource(url: string): Promise<ArrayBuffer | null> {
    const path = new URL(url).pathname;
    const [, z, x, y] = TILE_PATH.exec(path) ?? [];
    if (z) return this.tile(Number(z), Number(x), Number(y));
    if (path === INDEX_PATH) return this.tileIndex();
    return this.stored(ASSET_BUCKET, path, () => this.download(url));
  }

  /** Always the newest list if possible: old builds of the map are removed from the server. */
  private async tileIndex(): Promise<ArrayBuffer | null> {
    try {
      if (navigator.onLine === false) throw new Error('offline');
      const { ok, body } = await this.http.getJson(OPEN_FREE_MAP + INDEX_PATH, INDEX_TIMEOUT_MS);
      if (!ok || !body) throw new Error('OpenFreeMap not available');
      const { buffer } = new TextEncoder().encode(JSON.stringify(body));
      await this.put(ASSET_BUCKET, INDEX_PATH, buffer);
      return buffer;
    } catch {
      return (await this.get<ArrayBuffer>(ASSET_BUCKET, INDEX_PATH))?.value ?? null;
    }
  }

  private template(): Promise<string> {
    if (!this.index || Date.now() - this.index.at > INDEX_FRESH_MS) {
      const template = this.tileIndex().then((bytes) => {
        const url =
          bytes && (JSON.parse(new TextDecoder().decode(bytes)) as { tiles?: string[] }).tiles?.[0];
        if (!url) throw new Error('OpenFreeMap not available');
        return url;
      });
      this.index = { at: Date.now(), template };
      template.catch(() => (this.index = undefined));
    }
    return this.index.template;
  }

  /** What is stored is used at once; if it is old, it is renewed for the next time. */
  private async stored(
    bucket: string,
    key: string,
    load: () => Promise<ArrayBuffer>,
  ): Promise<ArrayBuffer | null> {
    const cached = await this.get<ArrayBuffer>(bucket, key);
    const renew = async () => {
      if (navigator.onLine === false) throw new Error('offline');
      const bytes = await load();
      // Before it is handed out: the receiver may transfer it to a worker.
      await this.put(bucket, key, bytes);
      return bytes;
    };
    if (!cached) return renew().catch(() => null);
    if (Date.now() - cached.fetchedAt > FRESH_MS) void renew().catch(() => undefined);
    return cached.value;
  }

  private async download(url: string): Promise<ArrayBuffer> {
    const blob = await this.http.getBlob(url);
    if (!blob) {
      // Perhaps a new build of the map has replaced the known one.
      this.index = undefined;
      throw new Error('Not available');
    }
    return blob.arrayBuffer();
  }

  private get<T>(bucket: string, key: string): Promise<Cached<T> | undefined> {
    return this.cache.get<Cached<T>>(bucket, key).catch(() => undefined);
  }

  private async put(bucket: string, key: string, value: ArrayBuffer): Promise<void> {
    const entry: Cached<ArrayBuffer> = { fetchedAt: Date.now(), value };
    await this.cache.put(bucket, key, entry).catch(() => undefined);
    const writes = (this.writes.get(bucket) ?? 0) + 1;
    this.writes.set(bucket, writes);
    if (writes % PRUNE_EVERY === 0) {
      void this.cache.prune(bucket, LIMITS[bucket]).catch(() => 0);
    }
  }
}
