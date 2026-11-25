export type LonLat = readonly [lon: number, lat: number];

export interface ParkingSpot {
  readonly at: LonLat;
  /** unix ms */
  readonly since: number;
  readonly street: string;
  readonly note: string;
  /** end of the paid time, null = no meter */
  readonly until: number | null;
  /** what was already reminded of */
  readonly reminded: readonly Reminded[];
}

export type Reminded = 'soon' | 'over';
export const METER_MINUTES: readonly number[] = [15, 30, 60, 90, 120, 180];
export const REMIND_BEFORE_MS = 10 * 60_000;

/** @param keepMeter a meter set before the spot was found again automatically */
export function parkAt(
  at: LonLat,
  street: string,
  now: number,
  keepMeter: ParkingSpot | null,
): ParkingSpot {
  const running = keepMeter?.until && keepMeter.until > now ? keepMeter : null;
  return {
    at: [round(at[0]), round(at[1])],
    since: now,
    street,
    note: '',
    until: running?.until ?? null,
    reminded: running?.reminded ?? [],
  };
}

export function withMeter(spot: ParkingSpot, minutes: number, now: number): ParkingSpot {
  return { ...spot, until: minutes ? now + minutes * 60_000 : null, reminded: [] };
}

/** The reminder that is due now, null if none. */
export function dueReminder(spot: ParkingSpot, now: number): Reminded | null {
  if (spot.until === null) return null;
  const left = spot.until - now;
  if (left <= 0) return spot.reminded.includes('over') ? null : 'over';
  if (left > REMIND_BEFORE_MS) return null;
  return spot.reminded.includes('soon') ? null : 'soon';
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** Port: where the spot is kept. */
export abstract class ParkingRepository {
  abstract load(): Promise<ParkingSpot | undefined>;
  abstract save(spot: ParkingSpot | null): Promise<void>;
}

export interface DriveSample {
  readonly now: number;
  readonly speedKmh: number;
  readonly rpm: number;
  /** data of the car arrives */
  readonly connected: boolean;
}

const DRIVING_KMH = 15;
const MIN_DRIVE_MS = 60_000;
const ENGINE_OFF_MS = 20_000;

/**
 * Notices the end of a drive: the engine is off for a while, or the car no
 * longer answers after it stood. A short loss while driving is no end.
 */
export class DriveEndDetector {
  private drivingSince: number | null = null;
  private stoppedSince: number | null = null;
  private lastSpeed = 0;

  next({ now, speedKmh, rpm, connected }: DriveSample): boolean {
    if (!connected) {
      const ended = this.drove(now) && this.lastSpeed < DRIVING_KMH && this.silentFor(now);
      return ended && this.end();
    }
    this.lastSpeed = speedKmh;
    if (speedKmh > DRIVING_KMH) this.drivingSince ??= now;
    if (speedKmh > 1 || rpm > 0) {
      this.stoppedSince = null;
      return false;
    }
    return this.drove(now) && this.silentFor(now) && this.end();
  }

  private drove(now: number): boolean {
    return this.drivingSince !== null && now - this.drivingSince >= MIN_DRIVE_MS;
  }

  private silentFor(now: number): boolean {
    this.stoppedSince ??= now;
    return now - this.stoppedSince >= ENGINE_OFF_MS;
  }

  private end(): true {
    this.drivingSince = this.stoppedSince = null;
    return true;
  }
}

/** Parking spot of the prototype (localStorage `pd_park`). */
export interface LegacyParking {
  p?: [number, number];
  t?: number;
  until?: number;
  note?: string;
  street?: string;
  w?: { a?: number; b?: number };
}

export function parkingFromLegacy(legacy: LegacyParking): ParkingSpot | null {
  const [lon, lat] = legacy.p ?? [];
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const reminded: Reminded[] = [];
  if (legacy.w?.a) reminded.push('soon');
  if (legacy.w?.b) reminded.push('over');
  return {
    at: [lon as number, lat as number],
    since: legacy.t ?? Date.now(),
    street: legacy.street ?? '',
    note: legacy.note ?? '',
    until: legacy.until || null,
    reminded,
  };
}
