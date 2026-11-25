import { Coordinate, polyline, snap } from '../domain/geo';
import { Congestion, NoRouteError, ProviderId, Route, RouteStep } from '../domain/route';

interface OsrmResponse {
  code?: string;
  routes?: {
    duration: number;
    duration_typical?: number;
    geometry: { coordinates: [number, number][] };
    legs: {
      steps: {
        name?: string;
        ref?: string;
        maneuver: {
          type: string;
          modifier?: string;
          exit?: number;
          location: [number, number];
        };
      }[];
      annotation?: { congestion?: string[] };
    }[];
  }[];
}

/** Reads the answer of OSRM and Mapbox Directions, which share one format. */
export function routeFromOsrm(body: unknown, provider: ProviderId): Route {
  const raw = (body as OsrmResponse | null)?.routes?.[0];
  if (!raw || raw.geometry.coordinates.length < 2) throw new NoRouteError();
  const points: Coordinate[] = raw.geometry.coordinates;
  const line = polyline(points);
  let last = 0;
  const steps: RouteStep[] = raw.legs[0].steps.map(({ maneuver, name, ref }) => {
    // Steps are in order, so each lies after the one before it.
    const { alongM } =
      maneuver.type === 'arrive'
        ? { alongM: line.lengthM }
        : snap(line, maneuver.location, { fromM: last, toM: Infinity });
    last = Math.max(last, alongM);
    return {
      maneuver: {
        type: maneuver.type,
        modifier: maneuver.modifier ?? '',
        exit: maneuver.exit ?? null,
      },
      street: name || ref || '',
      alongM: last,
    };
  });
  if (!steps.length) throw new NoRouteError();
  return {
    provider,
    line,
    durationS: raw.duration,
    delayS: Math.max(0, raw.duration - (raw.duration_typical ?? raw.duration)),
    steps,
    congestion: congestionOf(raw.legs[0].annotation?.congestion ?? [], points),
  };
}

const LEVELS: Record<string, Congestion['level'] | undefined> = {
  moderate: 'slow',
  heavy: 'jam',
  severe: 'jam',
};

function congestionOf(levels: readonly string[], points: readonly Coordinate[]): Congestion[] {
  const result: Congestion[] = [];
  for (let start = 0; start < levels.length;) {
    let end = start;
    while (end + 1 < levels.length && LEVELS[levels[end + 1]] === LEVELS[levels[start]]) end++;
    const level = LEVELS[levels[start]];
    if (level) result.push({ level, points: points.slice(start, end + 2) });
    start = end + 1;
  }
  return result;
}
