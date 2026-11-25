import { LonLat, metresBetween } from './road';

/** Kinds of messages, by the TomTom category. Others are not shown. */
export const TRAFFIC_KINDS = {
  1: 'accident',
  2: 'fog',
  3: 'danger',
  4: 'rain',
  5: 'ice',
  6: 'jam',
  7: 'lane_closed',
  8: 'road_closed',
  9: 'roadworks',
  10: 'wind',
  11: 'flooding',
  14: 'breakdown',
} as const;
export type TrafficKind = (typeof TRAFFIC_KINDS)[keyof typeof TRAFFIC_KINDS];

export interface Incident {
  readonly id: string;
  readonly kind: TrafficKind;
  readonly at: LonLat;
  readonly text: string;
  /** 0 unknown to 4 */
  readonly magnitude: number;
}

/** Port: traffic messages around a place; null if the service did not answer. */
export abstract class TrafficSource {
  abstract around(at: LonLat): Promise<Incident[] | null>;
}

/** Messages about speed checks are forbidden in Switzerland and are dropped. */
const CONTROL =
  /radar|blitzer|kontroll|speed\s*(camera|check|trap)|camera|contr[oô]le|autovelox|tutor|polizei|police|polizia/i;

export function trafficKind(category: number): TrafficKind | null {
  return TRAFFIC_KINDS[category as keyof typeof TRAFFIC_KINDS] ?? null;
}

export function isControl(text: string): boolean {
  return CONTROL.test(text);
}

const SAME_PLACE_M = 150;

/** Joins sources; the same message from two of them appears once. */
export function mergeIncidents(lists: readonly (readonly Incident[])[]): Incident[] {
  const result: Incident[] = [];
  for (const incident of lists.flat()) {
    if (isControl(incident.text)) continue;
    const known = result.some(
      ({ kind, at }) => kind === incident.kind && metresBetween(at, incident.at) < SAME_PLACE_M,
    );
    if (!known) result.push(incident);
  }
  return result;
}

/** Whether a new message is worth saying aloud. */
export function isUrgent({ kind, magnitude }: Incident, distanceM: number): boolean {
  if (distanceM < 3000 && (kind === 'accident' || kind === 'road_closed')) return true;
  const serious = kind === 'accident' || kind === 'jam' || kind === 'road_closed';
  return distanceM < 5000 && serious && magnitude >= 2;
}
