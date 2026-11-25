import { Injectable, inject } from '@angular/core';
import { DETAIL_BUCKET } from '@core/map';
import { CacheStore } from '@core/storage';
import { Coordinate } from '../domain/geo';
import { tilesForRoute } from '../domain/offline-route';
import { NavigationService } from '../domain/ports';
import { ROAD_ZOOM, tileAt } from '../domain/road-graph';
import { NoRouteError, Place, Route } from '../domain/route';
import type { RoutingAnswer, RoutingRequest } from './offline-routing.worker';
import type { RawTile } from './road-tiles';

/** Calculates routes on the device from the vector tiles already stored. Never asks the network. */
@Injectable()
export class OfflineRoutingService extends NavigationService {
  readonly id = 'osm' as const;
  private readonly cache = inject(CacheStore);
  private worker?: Worker;
  private nextId = 0;
  private readonly pending = new Map<
    number,
    { resolve(route: Route): void; reject(error: Error): void }
  >();

  async route(from: Coordinate, to: Coordinate): Promise<Route> {
    const wanted = tilesForRoute(from, to);
    const ends = await Promise.all([from, to].map((place) => this.tile(tileAt(place))));
    if (!ends.every(Boolean)) throw new NoRouteError();
    const tiles = (await Promise.all(wanted.map((tile) => this.tile(tile)))).filter(
      (tile) => tile !== null,
    );
    return this.calculate(tiles, from, to);
  }

  async search(): Promise<Place[]> {
    return [];
  }

  async suggest(): Promise<Place[]> {
    return [];
  }

  private async tile({ x, y }: { x: number; y: number }): Promise<RawTile | null> {
    const entry = await this.cache
      .get<{ value: ArrayBuffer }>(DETAIL_BUCKET, `${ROAD_ZOOM}/${x}/${y}`)
      .catch(() => undefined);
    return entry ? { x, y, bytes: entry.value } : null;
  }

  private calculate(tiles: RawTile[], from: Coordinate, to: Coordinate): Promise<Route> {
    const worker = (this.worker ??= this.start());
    const request: RoutingRequest = { id: this.nextId++, tiles, from, to };
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject });
      worker.postMessage(
        request,
        tiles.map(({ bytes }) => bytes),
      );
    });
  }

  private start(): Worker {
    const worker = new Worker(new URL('./offline-routing.worker', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = ({ data: { id, route, error } }: MessageEvent<RoutingAnswer>) => {
      const pending = this.pending.get(id);
      this.pending.delete(id);
      if (route) pending?.resolve(route);
      else pending?.reject(error ? new Error(error) : new NoRouteError());
    };
    worker.onerror = () => {
      this.pending.forEach(({ reject }) => reject(new Error('Routing worker failed.')));
      this.pending.clear();
      worker.terminate();
      this.worker = undefined;
    };
    return worker;
  }
}
