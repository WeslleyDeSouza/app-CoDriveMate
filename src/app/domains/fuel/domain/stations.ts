import { isOpen } from './opening-hours';

export type LonLat = readonly [lon: number, lat: number];

export interface Station {
  /** OpenStreetMap id, e.g. N123 */
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly at: LonLat;
  /** '' = unknown */
  readonly openingHours: string;
  /** fuels it certainly does not sell */
  readonly lacks: readonly ('petrol' | 'diesel')[];
}

/** Port: filling stations around places. */
export abstract class StationSource {
  /** Quick answer, without opening hours. */
  abstract around(points: readonly LonLat[], radiusM: number): Promise<Station[]>;
  /** The same with details, from a slower service; null if it does not answer. */
  abstract detailed(points: readonly LonLat[], radiusM: number): Promise<Station[] | null>;
}

export interface RatedStation extends Station {
  readonly distanceM: number;
  readonly open: boolean | null;
}

/** Joins both answers; details replace what is known about the same station. */
export function mergeStations(quick: readonly Station[], detailed: readonly Station[]): Station[] {
  const all = new Map(quick.map((station) => [station.id, station]));
  for (const station of detailed) {
    const known = all.get(station.id);
    all.set(station.id, { ...station, address: station.address || (known?.address ?? '') });
  }
  return [...all.values()];
}

/** Stations that sell the fuel, the nearest first, closed ones last. */
export function rateStations(
  stations: readonly Station[],
  fuel: 'petrol' | 'diesel',
  distanceTo: (station: Station) => number,
  now: Date,
  limit: number,
): RatedStation[] {
  return stations
    .filter(({ lacks }) => !lacks.includes(fuel))
    .map((station) => ({
      ...station,
      distanceM: distanceTo(station),
      open: isOpen(station.openingHours, now),
    }))
    .sort(
      (a, b) => Number(a.open === false) - Number(b.open === false) || a.distanceM - b.distanceM,
    )
    .slice(0, limit);
}
