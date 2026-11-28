import { Injectable, inject } from '@angular/core';
import { DETAIL_BUCKET } from '@core/map';
import { CacheStore } from '@core/storage';
import { Coordinate, move } from '../domain/geo';
import { ROAD_ZOOM, tileAt, toCoordinate } from '../domain/road-graph';
import { NearRoad, RoadSource } from '../domain/road-match';

/** Roads further away than this from the car are in a neighbouring tile at most. */
const AROUND_M = 300;
const KEPT_TILES = 12;
const UNITS = 4096;

/** Roads from the vector tiles already stored for the map. Never asks the network. */
@Injectable()
export class TileRoadSource extends RoadSource {
  private readonly cache = inject(CacheStore);
  private readonly tiles = new Map<string, Promise<readonly NearRoad[] | null>>();

  async roadsNear(place: Coordinate): Promise<readonly NearRoad[] | null> {
    const keys = new Map<string, { x: number; y: number }>();
    for (const direction of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const tile = tileAt(move(place, direction, AROUND_M));
      keys.set(`${tile.x}/${tile.y}`, tile);
    }
    const here = tileAt(place);
    keys.set(`${here.x}/${here.y}`, here);
    const loaded = await Promise.all([...keys.values()].map((tile) => this.tile(tile)));
    const known = loaded.filter((roads) => roads !== null);
    return known.length ? known.flat() : null;
  }

  private tile({ x, y }: { x: number; y: number }): Promise<readonly NearRoad[] | null> {
    const key = `${x}/${y}`;
    let roads = this.tiles.get(key);
    if (!roads) {
      roads = this.read(x, y).catch(() => null);
      this.tiles.set(key, roads);
      // A tile that is missing may be stored later: it is asked for again.
      void roads.then((found) => {
        if (!found && this.tiles.get(key) === roads) this.tiles.delete(key);
      });
      if (this.tiles.size > KEPT_TILES) this.tiles.delete(this.tiles.keys().next().value!);
    }
    return roads;
  }

  private async read(x: number, y: number): Promise<readonly NearRoad[] | null> {
    const entry = await this.cache.get<{ value: ArrayBuffer }>(
      DETAIL_BUCKET,
      `${ROAD_ZOOM}/${x}/${y}`,
    );
    if (!entry) return null;
    const { roadTile } = await import('./road-tiles');
    const tile = roadTile({ x, y, bytes: entry.value });
    const factor = UNITS / tile.extent;
    return tile.roads.map(({ points, oneway }) => ({
      oneway,
      points: points.map((p) =>
        toCoordinate({ x: x * UNITS + p.x * factor, y: y * UNITS + p.y * factor }),
      ),
    }));
  }
}
