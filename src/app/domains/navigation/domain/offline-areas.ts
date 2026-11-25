import { Coordinate } from './geo';
import { tilesAlong } from './map-tiles';

/** What was saved completely along one route; tile names only, not the route. */
export interface OfflineArea {
  readonly savedAt: number;
  /** what the map and the 3D view showed, as that decides what was saved */
  readonly view: string;
  readonly tiles: readonly string[];
}

const ZOOM = 14;
/** Below the limit of the tile store, so that what is listed is really there. */
const MAX_TILES = 3000;
const MAX_AGE_MS = 90 * 86_400_000;

function tilesOf(points: readonly Coordinate[]): string[] {
  return tilesAlong(points, ZOOM, ZOOM, Infinity, 0).map(({ x, y }) => `${x}/${y}`);
}

export function withArea(
  areas: readonly OfflineArea[],
  points: readonly Coordinate[],
  view: string,
  now: number,
): OfflineArea[] {
  const result: OfflineArea[] = [];
  let count = 0;
  for (const area of [{ savedAt: now, view, tiles: tilesOf(points) }, ...areas]) {
    // Neighbours are saved as well, about three times as many.
    count += area.tiles.length * 3;
    if (result.length && (count > MAX_TILES || now - area.savedAt > MAX_AGE_MS)) break;
    result.push(area);
  }
  return result;
}

/**
 * Whether everything along the line is saved, in either direction. Mapbox keeps
 * only the last region (`lastOnly`).
 */
export function isCovered(
  areas: readonly OfflineArea[],
  points: readonly Coordinate[],
  view: string,
  lastOnly: boolean,
  now: number,
): boolean {
  if (!points.length) return false;
  const usable = (lastOnly ? areas.slice(0, 1) : areas).filter(
    (area) => area.view === view && now - area.savedAt <= MAX_AGE_MS,
  );
  const saved = new Set(usable.flatMap(({ tiles }) => tiles));
  return tilesOf(points).every((tile) => saved.has(tile));
}
