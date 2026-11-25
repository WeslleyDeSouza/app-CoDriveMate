import { Injectable, inject } from '@angular/core';
import { HttpPort } from '@core/http';
import { OpenFreeMap } from '@core/map';
import { CacheStore } from '@core/storage';
import {
  EnvironmentData,
  EnvironmentDetails,
  LonLat,
  cellKey,
  detailsQuery,
  parseDetails,
  tilesAround,
} from '../domain/environment';
import { EnvironmentSource } from '../domain/ports';
import { ROAD_RADIUS_M, VECTOR_ZOOM } from './vector-tiles';
import { WorldWorker } from './worker-geometry.builder';
import type { RawTile } from './world.worker';

const TREE_BUCKET = 'trees';
const FRESH_MS = 14 * 86_400_000;
const MAX_CELLS = 1500;
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
/** A server that refused or timed out is left alone for this long. */
const PAUSE_MS = 120_000;

interface Cached<T> {
  readonly fetchedAt: number;
  readonly value: T;
}

/**
 * Roads, buildings and forests from OpenFreeMap vector tiles (fast, no key, no
 * limits); trees and crossings from Overpass when it answers. Everything driven
 * through stays available offline.
 */
@Injectable()
export class OsmEnvironmentSource extends EnvironmentSource {
  private readonly http = inject(HttpPort);
  private readonly cache = inject(CacheStore);
  private readonly map = inject(OpenFreeMap);
  private readonly worker = inject(WorldWorker);
  private readonly pausedUntil = new Map<string, number>();

  async load(cell: LonLat): Promise<EnvironmentData | null> {
    const tiles = await Promise.all(
      tilesAround(cell, ROAD_RADIUS_M, VECTOR_ZOOM).map(({ x, y }) => this.tile(x, y)),
    );
    if (tiles.some((tile) => !tile)) return null;
    return this.worker.decode(tiles as RawTile[], cell);
  }

  async details(cell: LonLat): Promise<EnvironmentDetails | null> {
    // Entries without prefix are from before crossings were asked for.
    const key = 'd/' + cellKey(cell);
    const cached = await this.cached<EnvironmentDetails>(TREE_BUCKET, key);
    if (cached && Date.now() - cached.fetchedAt < FRESH_MS) return cached.value;
    const query = '?data=' + encodeURIComponent(detailsQuery(cell));
    for (const server of OVERPASS) {
      if (navigator.onLine === false || Date.now() < (this.pausedUntil.get(server) ?? 0)) continue;
      try {
        const result = await this.http.getJson(server + query, 12000);
        const details = result.ok ? parseDetails(result.body) : null;
        if (details) {
          await this.store(TREE_BUCKET, key, details);
          if (Math.random() < 0.05) void this.cache.prune(TREE_BUCKET, MAX_CELLS).catch(() => 0);
          return details;
        }
      } catch {
        // Unreachable or overloaded: paused below like a refusal.
      }
      this.pausedUntil.set(server, Date.now() + PAUSE_MS);
    }
    return cached?.value ?? null;
  }

  async keep(cell: LonLat): Promise<boolean> {
    const tiles = tilesAround(cell, ROAD_RADIUS_M, VECTOR_ZOOM);
    return (await Promise.all(tiles.map(({ x, y }) => this.tile(x, y)))).every(Boolean);
  }

  private async tile(x: number, y: number): Promise<RawTile | null> {
    const bytes = await this.map.tile(VECTOR_ZOOM, x, y);
    return bytes && { x, y, bytes };
  }

  private cached<T>(bucket: string, key: string): Promise<Cached<T> | undefined> {
    return this.cache.get<Cached<T>>(bucket, key).catch(() => undefined);
  }

  private async store<T>(bucket: string, key: string, value: T): Promise<void> {
    const entry: Cached<T> = { fetchedAt: Date.now(), value };
    await this.cache.put(bucket, key, entry).catch(() => undefined);
  }
}
