/** [longitude, latitude] in degrees. */
export type LonLat = readonly [lon: number, lat: number];

/** Raw surroundings of one grid cell, from OpenStreetMap. */
export interface EnvironmentData {
  readonly center: LonLat;
  readonly roads: readonly Road[];
  readonly streets: readonly Street[];
  readonly buildings: readonly Building[];
  readonly trees: readonly Tree[];
  readonly forests: readonly (readonly LonLat[])[];
  readonly crossings?: readonly LonLat[];
}

/** What the slower service knows about a cell. */
export interface EnvironmentDetails {
  readonly trees: readonly Tree[];
  /** pedestrian crossings */
  readonly crossings: readonly LonLat[];
}

export interface Road {
  readonly kind: string;
  readonly lanes: number;
  readonly oneway: boolean;
  readonly points: readonly LonLat[];
}

export interface Street {
  readonly name: string;
  readonly points: readonly LonLat[];
}

export interface Building {
  readonly heightM: number;
  readonly outline: readonly LonLat[];
}

export interface Tree {
  readonly heightM: number;
  readonly at: LonLat;
}

const RAD = Math.PI / 180;
/** On the WGS84 ellipsoid around 47° north, to match the swisstopo 3D tiles. */
export const METRES_PER_DEGREE_LAT = 111175;

export function metresPerDegreeLon(lat: number): number {
  return 111412.84 * Math.cos(lat * RAD) - 93.5 * Math.cos(3 * lat * RAD);
}

/** Centre of the grid cell (about 370 m) a point lies in. */
export function cellOf(point: LonLat): LonLat {
  return [Math.round(point[0] * 200) / 200, Math.round(point[1] * 300) / 300];
}

export function cellKey(cell: LonLat): string {
  return cell[1].toFixed(4) + '_' + cell[0].toFixed(4);
}

/** Point `distanceM` ahead in direction `heading`. */
export function ahead(from: LonLat, heading: number, distanceM: number): LonLat {
  return [
    from[0] + (Math.sin(heading * RAD) * distanceM) / metresPerDegreeLon(from[1]),
    from[1] + (Math.cos(heading * RAD) * distanceM) / METRES_PER_DEGREE_LAT,
  ];
}

/** swisstopo aerial images exist for Switzerland only. */
export function hasAerialImages([lon, lat]: LonLat): boolean {
  return lon > 5.9 && lon < 10.6 && lat > 45.8 && lat < 47.9;
}

/** Overpass query for the single trees and pedestrian crossings of a cell. */
export function detailsQuery(center: LonLat): string {
  const around = `around:480,${center[1].toFixed(5)},${center[0].toFixed(5)}`;
  return (
    `[out:json][timeout:10];(node(${around})[natural=tree];` +
    `node(${around})[highway=crossing];);out 2500;`
  );
}

/** Reads an Overpass answer; null if it is none. */
export function parseDetails(body: unknown): EnvironmentDetails | null {
  const answer = body as {
    elements?: { lat?: number; lon?: number; tags?: Record<string, string> }[];
    remark?: string;
  } | null;
  if (!Array.isArray(answer?.elements)) return null;
  // Overpass reports a timeout as a remark on an incomplete answer.
  if (!answer.elements.length && answer.remark) return null;
  const trees: Tree[] = [];
  const crossings: LonLat[] = [];
  for (const { lat, lon, tags } of answer.elements) {
    if (lat === undefined || lon === undefined) continue;
    if (tags?.['highway'] === 'crossing') {
      if (tags['crossing'] !== 'unmarked') crossings.push([lon, lat]);
      continue;
    }
    const height = parseFloat((tags?.['height'] ?? '').replace(',', '.')) || 0;
    trees.push({ at: [lon, lat], heightM: Math.min(40, height) });
  }
  return { trees, crossings };
}

/** Whether any part of a shape lies within a square around a point. */
export function isWithin(points: readonly LonLat[], center: LonLat, radiusM: number): boolean {
  const dLon = radiusM / metresPerDegreeLon(center[1]);
  const dLat = radiusM / METRES_PER_DEGREE_LAT;
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of points) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return (
    west < center[0] + dLon &&
    east > center[0] - dLon &&
    south < center[1] + dLat &&
    north > center[1] - dLat
  );
}

/** Points every `stepM` metres along a line, with both ends. */
export function pointsAlong(line: readonly LonLat[], stepM: number): LonLat[] {
  const result: LonLat[] = line.length ? [line[0]] : [];
  let missing = stepM;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const length = Math.hypot(
      (b[0] - a[0]) * metresPerDegreeLon(a[1]),
      (b[1] - a[1]) * METRES_PER_DEGREE_LAT,
    );
    let at = missing;
    for (; at < length; at += stepM) {
      const f = at / length;
      result.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    missing = at - length;
  }
  if (line.length > 1) result.push(line[line.length - 1]);
  return result;
}

/** Name of the road the car is on, '' if none is near. */
export function roadNameAt(
  data: EnvironmentData,
  at: LonLat,
  heading: number,
  moving: boolean,
): string {
  const kx = metresPerDegreeLon(at[1]);
  let best = '';
  let bestDistance = 30;
  for (const road of data.streets) {
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const ax = (a[0] - at[0]) * kx;
      const ay = (a[1] - at[1]) * METRES_PER_DEGREE_LAT;
      const dx = (b[0] - a[0]) * kx;
      const dy = (b[1] - a[1]) * METRES_PER_DEGREE_LAT;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      let distance = Math.hypot(ax + dx * t, ay + dy * t);
      if (moving) {
        // A crossing road is closer for a moment, but points elsewhere.
        const direction = (Math.atan2(dx, dy) / RAD + 360) % 360;
        const difference = Math.abs(((((direction - heading) % 180) + 270) % 180) - 90);
        if (difference > 40) distance += 12;
      }
      if (distance < bestDistance) {
        bestDistance = distance;
        best = road.name;
      }
    }
  }
  return best;
}

/** Web Mercator tile a point lies in. */
export function tileOf([lon, lat]: LonLat, zoom: number): { x: number; y: number } {
  const r = lat * RAD;
  return {
    x: Math.floor(((lon + 180) / 360) * 2 ** zoom),
    y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** zoom),
  };
}

/** Tiles touching a square around a point. */
export function tilesAround(
  center: LonLat,
  radiusM: number,
  zoom: number,
): { x: number; y: number }[] {
  const dLon = radiusM / metresPerDegreeLon(center[1]);
  const dLat = radiusM / METRES_PER_DEGREE_LAT;
  const from = tileOf([center[0] - dLon, center[1] + dLat], zoom);
  const to = tileOf([center[0] + dLon, center[1] - dLat], zoom);
  const tiles: { x: number; y: number }[] = [];
  for (let x = from.x; x <= to.x; x++) for (let y = from.y; y <= to.y; y++) tiles.push({ x, y });
  return tiles;
}

/** North-west corner of a tile. */
export function tileCorner(x: number, y: number, zoom: number): LonLat {
  return [
    (x / 2 ** zoom) * 360 - 180,
    Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / 2 ** zoom)) / RAD,
  ];
}
