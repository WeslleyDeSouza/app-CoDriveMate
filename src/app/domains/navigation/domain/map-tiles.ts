import { Coordinate, distanceM } from './geo';

export interface TileId {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

/** Closer than half a tile at the closest zoom, so that none is skipped. */
const STEP_M = 600;

/** Tiles along a line including their neighbours, whole world first. */
export function tilesAlong(
  points: readonly Coordinate[],
  minZoom: number,
  maxZoom: number,
  limit: number,
): TileId[] {
  const places = sample(points);
  const tiles = new Map<string, TileId>();
  for (let z = minZoom; z <= maxZoom; z++) {
    const size = 2 ** z;
    for (const [lon, lat] of places) {
      const rad = (lat * Math.PI) / 180;
      const tx = Math.floor(((lon + 180) / 360) * size);
      const ty = Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * size);
      for (let y = ty - 1; y <= ty + 1; y++) {
        if (y < 0 || y >= size) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (tiles.size >= limit) return [...tiles.values()];
          const x = (tx + dx + size) % size;
          tiles.set(`${z}/${x}/${y}`, { z, x, y });
        }
      }
    }
  }
  return [...tiles.values()];
}

/** Points of the line not further apart than the step, also on long straights. */
function sample(points: readonly Coordinate[]): Coordinate[] {
  const result: Coordinate[] = points.slice(0, 1);
  for (const point of points) {
    const last = result[result.length - 1];
    const distance = distanceM(last, point);
    if (distance < STEP_M) continue;
    const parts = Math.ceil(distance / STEP_M);
    for (let i = 1; i <= parts; i++) {
      const share = i / parts;
      result.push([last[0] + (point[0] - last[0]) * share, last[1] + (point[1] - last[1]) * share]);
    }
  }
  const end = points[points.length - 1];
  return end ? [...result, end] : result;
}
