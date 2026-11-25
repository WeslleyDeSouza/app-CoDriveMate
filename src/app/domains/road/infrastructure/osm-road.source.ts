import { Injectable, inject } from '@angular/core';
import { OverpassClient } from '@core/http/overpass';
import { CacheStore } from '@core/storage';
import { LonLat, RoadData, RoadSource, parseRoad, roadQuery } from '../domain/road';

const BUCKET = 'road';
const FRESH_MS = 30 * 86_400_000;
const MAX_ENTRIES = 600;

/** Hazards and limits from OpenStreetMap; what was driven through stays available offline. */
@Injectable()
export class OsmRoadSource extends RoadSource {
  private readonly overpass = inject(OverpassClient);
  private readonly cache = inject(CacheStore);

  async load(cell: LonLat): Promise<RoadData | null> {
    const key = cell.map((value) => value.toFixed(4)).join('_');
    const stored = await this.cache
      .get<{ at: number; data: RoadData }>(BUCKET, key)
      .catch(() => undefined);
    if (stored && Date.now() - stored.at < FRESH_MS) return stored.data;
    const data = await this.overpass.query(roadQuery(cell), parseRoad);
    if (!data) return stored?.data ?? null;
    await this.cache.put(BUCKET, key, { at: Date.now(), data }).catch(() => undefined);
    if (Math.random() < 0.05) void this.cache.prune(BUCKET, MAX_ENTRIES).catch(() => 0);
    return data;
  }
}
