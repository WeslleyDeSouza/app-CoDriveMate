export type LonLat = readonly [lon: number, lat: number];

const RAD = Math.PI / 180;
const KX = (lat: number) => Math.cos(lat * RAD) * 111320;
const KY = 110900;

export function metresBetween(a: LonLat, b: LonLat): number {
  return Math.hypot((b[0] - a[0]) * KX(a[1]), (b[1] - a[1]) * KY);
}

function bearingTo(a: LonLat, b: LonLat): number {
  return (Math.atan2((b[0] - a[0]) * KX(a[1]), (b[1] - a[1]) * KY) / RAD + 360) % 360;
}

const angle = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

/**
 * Kinds of fixed hazards. Switzerland forbids any help against speed checks:
 * this list must never contain cameras or controls, and nothing outside of it
 * is shown.
 */
export const HAZARD_KINDS = [
  'level_crossing',
  'school',
  'kindergarten',
  'curve',
  'animal_crossing',
  'falling_rocks',
  'landslide',
  'children',
  'slippery',
  'ice',
  'fog',
  'flooding',
  'queues_likely',
  'cyclists',
  'pedestrians',
  'side_winds',
  'steep_incline',
  'dangerous_junction',
  'accident_blackspot',
  'frost_heave',
] as const;
export type HazardKind = (typeof HAZARD_KINDS)[number];

const ALIASES: Record<string, HazardKind> = {
  curves: 'curve',
  deer_crossing: 'animal_crossing',
  school_zone: 'school',
};

export interface Hazard {
  readonly id: string;
  readonly kind: HazardKind;
  readonly at: LonLat;
}

export interface LimitedRoad {
  readonly kmh: number;
  readonly points: readonly LonLat[];
}

export interface RoadData {
  readonly hazards: readonly Hazard[];
  readonly roads: readonly LimitedRoad[];
}

/** Port: hazards and speed limits around a grid cell; null if not available. */
export abstract class RoadSource {
  abstract load(cell: LonLat): Promise<RoadData | null>;
}

/** Centre of the grid cell (about 1 km) a point lies in. */
export function roadCell([lon, lat]: LonLat): LonLat {
  return [Math.round(lon * 80) / 80, Math.round(lat * 100) / 100];
}

/** Joins cells; the same hazard may lie in several. */
export function mergeRoads(cells: readonly RoadData[]): RoadData {
  const hazards = new Map(cells.flatMap(({ hazards: list }) => list).map((h) => [h.id, h]));
  return { hazards: [...hazards.values()], roads: cells.flatMap(({ roads }) => roads) };
}

/** Point `metres` ahead in driving direction. */
export function pointAhead([lon, lat]: LonLat, heading: number, metres: number): LonLat {
  return [
    lon + (Math.sin(heading * RAD) * metres) / KX(lat),
    lat + (Math.cos(heading * RAD) * metres) / KY,
  ];
}

export function roadQuery([lon, lat]: LonLat): string {
  const at = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  return (
    '[out:json][timeout:20];(' +
    `node(around:2500,${at})[railway=level_crossing];` +
    `nwr(around:2500,${at})[hazard];` +
    `nwr(around:1500,${at})[amenity~"^(school|kindergarten)$"];` +
    `);out center tags 400;way(around:1300,${at})[highway][maxspeed];out tags geom 900;`
  );
}

interface Element {
  readonly type: string;
  readonly id: number;
  readonly lat?: number;
  readonly lon?: number;
  readonly center?: { readonly lat: number; readonly lon: number };
  readonly geometry?: readonly { readonly lat: number; readonly lon: number }[];
  readonly tags?: Record<string, string>;
}

export function parseRoad(body: unknown): RoadData | null {
  const answer = body as { elements?: Element[]; remark?: string } | null;
  if (!Array.isArray(answer?.elements) || (answer.remark && !answer.elements.length)) return null;
  const hazards: Hazard[] = [];
  const roads: LimitedRoad[] = [];
  for (const element of answer.elements) {
    const { tags = {}, geometry } = element;
    if (tags['highway'] && tags['maxspeed'] && geometry) {
      const kmh = parseLimit(tags['maxspeed']);
      if (kmh) roads.push({ kmh, points: geometry.map(({ lon, lat }) => [lon, lat] as const) });
      continue;
    }
    const kind = hazardKind(tags);
    const lon = element.lon ?? element.center?.lon;
    const lat = element.lat ?? element.center?.lat;
    if (kind && lon !== undefined && lat !== undefined) {
      hazards.push({ id: element.type + element.id, kind, at: [lon, lat] });
    }
  }
  return { hazards, roads };
}

function hazardKind(tags: Record<string, string>): HazardKind | null {
  if (tags['railway'] === 'level_crossing') return 'level_crossing';
  const raw = tags['hazard'] ?? tags['amenity'] ?? '';
  const kind = ALIASES[raw] ?? raw;
  return (HAZARD_KINDS as readonly string[]).includes(kind) ? (kind as HazardKind) : null;
}

const NAMED_LIMITS: Record<string, number> = {
  'CH:urban': 50,
  'CH:rural': 80,
  'CH:trunk': 100,
  'CH:motorway': 120,
  'CH:living_street': 20,
  'DE:urban': 50,
  'DE:rural': 100,
  'DE:living_street': 7,
  'AT:urban': 50,
  'AT:rural': 100,
  'FR:urban': 50,
  'FR:rural': 80,
  'IT:urban': 50,
  'IT:rural': 90,
  walk: 7,
};

/** km/h from a `maxspeed` value, null if there is no fixed limit. */
export function parseLimit(value: string): number | null {
  if (NAMED_LIMITS[value]) return NAMED_LIMITS[value];
  const number = parseInt(value, 10);
  if (!Number.isFinite(number) || number <= 0) return null;
  return /mph/.test(value) ? Math.round(number * 1.609) : number;
}

const ON_ROAD_M = 25;

/** Limit of the road the car is on; null if unknown. */
export function limitAt(
  roads: readonly LimitedRoad[],
  at: LonLat,
  heading: number,
  moving: boolean,
): number | null {
  let best: number | null = null;
  let bestDistance = ON_ROAD_M;
  const kx = KX(at[1]);
  for (const { kmh, points } of roads) {
    for (let i = 1; i < points.length; i++) {
      const ax = (points[i - 1][0] - at[0]) * kx;
      const ay = (points[i - 1][1] - at[1]) * KY;
      const dx = (points[i][0] - at[0]) * kx - ax;
      const dy = (points[i][1] - at[1]) * KY - ay;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      let distance = Math.hypot(ax + dx * t, ay + dy * t);
      if (moving) {
        // A crossing road is close for a moment, but points elsewhere.
        const off = angle((Math.atan2(dx, dy) / RAD + 360) % 360, heading);
        if (Math.min(off, 180 - off) > 35) distance += 15;
      }
      if (distance < bestDistance) {
        bestDistance = distance;
        best = kmh;
      }
    }
  }
  return best;
}

const REACH_M: Partial<Record<HazardKind, number>> = {
  level_crossing: 350,
  school: 200,
  kindergarten: 200,
};
const USUAL_REACH_M = 400;
const MIN_SPEED_KMH = 15;

export interface HazardAhead {
  readonly hazard: Hazard;
  readonly distanceM: number;
}

/** The nearest hazard in driving direction. Schools count on weekdays at daytime. */
export function hazardAhead(
  hazards: readonly Hazard[],
  at: LonLat,
  heading: number,
  speedKmh: number,
  now: Date,
): HazardAhead | null {
  if (speedKmh < MIN_SPEED_KMH) return null;
  const school =
    now.getDay() >= 1 && now.getDay() <= 5 && now.getHours() >= 7 && now.getHours() <= 18;
  let best: HazardAhead | null = null;
  for (const hazard of hazards) {
    const distanceM = metresBetween(at, hazard.at);
    if (distanceM < 15 || distanceM > (REACH_M[hazard.kind] ?? USUAL_REACH_M)) continue;
    if (angle(bearingTo(at, hazard.at), heading) > 35) continue;
    if ((hazard.kind === 'school' || hazard.kind === 'kindergarten') && !school) continue;
    if (!best || distanceM < best.distanceM) best = { hazard, distanceM };
  }
  return best;
}
