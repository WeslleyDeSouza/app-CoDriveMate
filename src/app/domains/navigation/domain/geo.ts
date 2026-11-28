/** [longitude, latitude] in degrees. */
export type Coordinate = readonly [lon: number, lat: number];

const RAD = Math.PI / 180;

/** Distance in metres. */
export function distanceM(a: Coordinate, b: Coordinate): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(s));
}

/** Bearing from a to b, 0-360°, 0 = north. */
export function bearing(a: Coordinate, b: Coordinate): number {
  const dLon = (b[0] - a[0]) * RAD;
  const y = Math.sin(dLon) * Math.cos(b[1] * RAD);
  const x =
    Math.cos(a[1] * RAD) * Math.sin(b[1] * RAD) -
    Math.sin(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.cos(dLon);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** The place `metres` further in direction `headingDeg`; for short distances. */
export function move(from: Coordinate, headingDeg: number, metres: number): Coordinate {
  const east = Math.sin(headingDeg * RAD) * metres;
  const north = Math.cos(headingDeg * RAD) * metres;
  return [from[0] + east / (Math.cos(from[1] * RAD) * 111320), from[1] + north / 110540];
}

/** A polyline with the running distance at every point. */
export interface Polyline {
  readonly points: readonly Coordinate[];
  readonly cumulative: readonly number[];
  readonly lengthM: number;
}

export function polyline(points: readonly Coordinate[]): Polyline {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + distanceM(points[i - 1], points[i]));
  }
  return { points, cumulative, lengthM: cumulative[cumulative.length - 1] };
}

/** Point and direction after `distance` metres on the line. */
export function pointAt(line: Polyline, distance: number): { point: Coordinate; heading: number } {
  if (line.points.length < 2) return { point: line.points[0], heading: 0 };
  const d = Math.max(0, Math.min(line.lengthM, distance));
  let i = 1;
  while (i < line.points.length - 1 && line.cumulative[i] < d) i++;
  const a = line.points[i - 1];
  const b = line.points[i];
  const f = (d - line.cumulative[i - 1]) / (line.cumulative[i] - line.cumulative[i - 1] || 1);
  return {
    point: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f],
    heading: bearing(a, b),
  };
}

/**
 * Nearest place on the line. With `fromM` only the part around that distance
 * is searched, so a route crossing itself does not make the progress jump.
 */
export function snap(
  line: Polyline,
  p: Coordinate,
  window?: { fromM: number; toM: number },
): { offsetM: number; alongM: number } {
  const kx = Math.cos(p[1] * RAD) * 111320;
  const ky = 110540;
  let best = { offsetM: Infinity, alongM: 0 };
  for (let i = 1; i < line.points.length; i++) {
    if (window && (line.cumulative[i] < window.fromM || line.cumulative[i - 1] > window.toM)) {
      continue;
    }
    const a = line.points[i - 1];
    const b = line.points[i];
    const ax = (a[0] - p[0]) * kx;
    const ay = (a[1] - p[1]) * ky;
    const dx = (b[0] - p[0]) * kx - ax;
    const dy = (b[1] - p[1]) * ky - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const offsetM = Math.hypot(ax + dx * t, ay + dy * t);
    if (offsetM < best.offsetM) {
      best = {
        offsetM,
        alongM: line.cumulative[i - 1] + (line.cumulative[i] - line.cumulative[i - 1]) * t,
      };
    }
  }
  return best;
}

/** Centre and zoom that show all points in a map of the given size, north up. */
export function fitPoints(
  points: readonly Coordinate[],
  width: number,
  height: number,
): { center: Coordinate; zoom: number } {
  const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of points) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  const middle = (mercator(south) + mercator(north)) / 2;
  const x = Math.max(1e-6, (east - west) / 360);
  const y = Math.max(1e-6, (mercator(north) - mercator(south)) / (2 * Math.PI));
  const zoom = Math.log2(Math.min(Math.max(80, width) / x, Math.max(80, height) / y) / 512);
  return {
    center: [(west + east) / 2, (2 * Math.atan(Math.exp(middle)) - Math.PI / 2) / RAD],
    zoom: Math.max(2, Math.min(17, zoom)),
  };
}

/** Map centre after dragging by (dx, dy) pixels; used where the map has no gestures of its own. */
export function panCenter(
  center: Coordinate,
  zoom: number,
  bearingDeg: number,
  pitchDeg: number,
  dx: number,
  dy: number,
): Coordinate {
  const world = 512 * 2 ** zoom;
  const stretched = dy / Math.max(0.3, Math.cos(pitchDeg * RAD));
  const cos = Math.cos(bearingDeg * RAD);
  const sin = Math.sin(bearingDeg * RAD);
  const mx = dx * cos - stretched * sin;
  const my = dx * sin + stretched * cos;
  const x = (center[0] + 180) / 360 - mx / world;
  const lat = center[1] * RAD;
  const y = 0.5 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / (2 * Math.PI) - my / world;
  return [x * 360 - 180, (2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2) / RAD];
}
