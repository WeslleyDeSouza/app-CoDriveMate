import { Injectable, inject } from '@angular/core';
import { HttpPort } from '@core/http';
import { CacheStore } from '@core/storage';
import { AerialSource } from '../domain/ports';

const BUCKET = 'tile';
const MAX_TILES = 12000;

/** swisstopo SWISSIMAGE, kept on the device for offline use. */
@Injectable()
export class SwisstopoAerialSource extends AerialSource {
  private readonly http = inject(HttpPort);
  private readonly cache = inject(CacheStore);

  async tile(zoom: number, x: number, y: number): Promise<Blob | null> {
    const key = `${zoom}/${x}/${y}`;
    try {
      const cached = await this.cache.get<Blob>(BUCKET, key);
      if (cached) return cached;
      if (navigator.onLine === false) return null;
      const blob = await this.http.getBlob(
        `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/${key}.jpeg`,
      );
      if (!blob) return null;
      await this.cache.put(BUCKET, key, blob);
      if (Math.random() < 0.01) void this.cache.prune(BUCKET, MAX_TILES).catch(() => 0);
      return blob;
    } catch {
      return null;
    }
  }
}
