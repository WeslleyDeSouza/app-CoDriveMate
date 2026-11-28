import { Coordinate, bearing } from './geo';

/** A road near the car, as far as placing the car on it needs. */
export interface NearRoad {
  readonly points: readonly Coordinate[];
  /** 1 along the points, -1 against them, 0 both ways */
  readonly oneway: 0 | 1 | -1;
}

/** Port: the roads around a place, from what is stored on the device; null if nothing is. */
export abstract class RoadSource {
  abstract roadsNear(place: Coordinate): Promise<readonly NearRoad[] | null>;
}

export interface RoadMatch {
  readonly coordinate: Coordinate;
  /** direction of the road, the way the car drives on it; null if the direction of travel is unknown */
  readonly heading: number | null;
  readonly road: NearRoad;
  /** metres from the first point of the road */
  readonly alongM: number;
  /** driven along the points; null like `heading` */
  readonly forward: boolean | null;
}

/** A road counts as the one driven on if it points this much like the car at most. */
const MAX_TURN = 60;
/** One degree off counts like this many metres beside the road. */
const METRES_PER_DEGREE = 0.4;

const RAD = Math.PI / 180;

/**
 * The place on the nearest road that fits the direction of travel, at most `maxM` away.
 * Null if there is none, e.g. on a car park.
 */
export function matchRoad(
  roads: readonly NearRoad[],
  place: Coordinate,
  heading: number | null,
  maxM: number,
): RoadMatch | null {
  const kx = Math.cos(place[1] * RAD) * 111320;
  const ky = 110540;
  let best: (RoadMatch & { cost: number }) | null = null;
  for (const road of roads) {
    const { points, oneway } = road;
    let beforeM = 0;
    for (let i = 1; i < points.length; i++) {
      const startM = beforeM;
      const a = points[i - 1];
      const b = points[i];
      const ax = (a[0] - place[0]) * kx;
      const ay = (a[1] - place[1]) * ky;
      const bx = (b[0] - place[0]) * kx;
      const by = (b[1] - place[1]) * ky;
      const lengthM = Math.hypot(bx - ax, by - ay);
      beforeM += lengthM;
      if (Math.min(ax, bx) > maxM || Math.max(ax, bx) < -maxM) continue;
      if (Math.min(ay, by) > maxM || Math.max(ay, by) < -maxM) continue;
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      const offsetM = Math.hypot(ax + dx * t, ay + dy * t);
      if (offsetM > maxM) continue;

      let direction: number | null = null;
      let turn = 0;
      if (heading !== null) {
        const along = bearing(a, b);
        const options = oneway > 0 ? [along] : oneway < 0 ? [along + 180] : [along, along + 180];
        direction = options.reduce((p, q) => (angle(p, heading) <= angle(q, heading) ? p : q));
        turn = angle(direction, heading);
        if (turn > MAX_TURN) continue;
      }
      const cost = offsetM + turn * METRES_PER_DEGREE;
      if (best && cost >= best.cost) continue;
      best = {
        cost,
        coordinate: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        heading: direction === null ? null : (direction + 360) % 360,
        road,
        alongM: startM + lengthM * t,
        forward: direction === null ? null : angle(direction, bearing(a, b)) < 90,
      };
    }
  }
  return best;
}

/** Difference of two directions, 0 to 180. */
export function angle(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
