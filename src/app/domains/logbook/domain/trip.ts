import { TripStats, TripValues } from './trip-values';

export type Coordinate = readonly [lon: number, lat: number];
export type TripSource = 'obd' | 'gps' | 'demo';

/** One recorded drive. */
export interface Trip {
  /** start timestamp in ms, also the identity */
  id: number;
  startedAt: number;
  endedAt: number;
  distanceKm: number;
  fuelL: number;
  maxSpeedKmh: number;
  from: string;
  to: string;
  source: TripSource;
  /** price per litre at the time of the trip */
  fuelPrice: number;
  cost: number;
  /** eco score 0-100 */
  score: number;
  driving: DrivingStyle;
  path: Coordinate[];
  end: Coordinate | null;
  /** lowest, highest and average values; missing on older trips */
  stats?: TripStats;
}

/** What the eco score is calculated from. */
export interface DrivingStyle {
  hardAccelerations: number;
  hardBrakings: number;
  /** seconds at high rpm */
  highRpmSeconds: number;
  /** seconds idling */
  idleSeconds: number;
}

/** Shorter trips are scored as if they were this long, so one event does not ruin them. */
const MIN_DISTANCE_FOR_SCORE_KM = 3;

/** Eco score 0-100: penalties per 10 km for harsh driving, high revs and idling. */
export function ecoScore(distanceKm: number, style: DrivingStyle): number {
  const km = Math.max(MIN_DISTANCE_FOR_SCORE_KM, distanceKm);
  const penalty =
    ((style.hardAccelerations * 3 +
      style.hardBrakings * 4 +
      style.highRpmSeconds / 8 +
      style.idleSeconds / 40) *
      10) /
    km;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

/** A moment while a trip is recorded. */
export interface TripMoment {
  readonly now: number;
  readonly seconds: number;
  readonly source: TripSource | null;
  readonly speedKmh: number;
  readonly rpm: number;
  readonly throttle: number | null;
  readonly gear: number | null;
  readonly gears: number;
  readonly rateLph: number | null;
  readonly at: Coordinate | null;
  readonly street: string;
  readonly fuelPrice: number;
}

export type EcoTip = 'accelerate' | 'brake' | 'shift' | 'idle';

const MOVING_KMH = 3;
const MIN_TRIP_KM = 0.3;
const MAX_POINTS = 4000;
const POINT_STEP_M = 40;
const HARD_ACCELERATION = 2.6;
const HARD_BRAKING = -3.2;
const HIGH_RPM = 3000;
const TIP_PAUSE_MS = 90_000;

/** Records a drive from start to end and watches how it is driven. */
export class TripRecorder {
  private trip: Trip | null = null;
  private stoppedS = 0;
  private lastSpeed = 0;
  private acceleration = 0;
  private accelerating = 0;
  private braking = 0;
  private highRpm = 0;
  private idle = 0;
  private readonly tips = new Map<EcoTip, number>();

  get current(): Trip | null {
    return this.trip;
  }

  /** The finished trip, or a tip, if this moment brings one. */
  next(m: TripMoment): { finished?: Trip; tip?: EcoTip } {
    const moving = m.speedKmh > MOVING_KMH;
    if (!this.trip) {
      if (!m.source || !moving) return {};
      this.begin(m);
    }
    const tip = m.source ? this.drive(m) : undefined;
    this.stoppedS = moving ? 0 : this.stoppedS + m.seconds;
    const engineOff = m.source === 'obd' && m.rpm < 300 && this.stoppedS > 45;
    const gone = !m.source && this.stoppedS > 60;
    if (engineOff || gone || this.stoppedS > 240) return { finished: this.finish(m) };
    return { tip };
  }

  private begin(m: TripMoment): void {
    this.lastSpeed = m.speedKmh;
    this.acceleration = this.accelerating = this.braking = this.highRpm = this.idle = 0;
    this.stoppedS = 0;
    this.trip = {
      id: m.now,
      startedAt: m.now,
      endedAt: m.now,
      distanceKm: 0,
      fuelL: 0,
      maxSpeedKmh: 0,
      from: m.street,
      to: '',
      source: m.source ?? 'gps',
      fuelPrice: m.fuelPrice,
      cost: 0,
      score: 100,
      driving: { hardAccelerations: 0, hardBrakings: 0, highRpmSeconds: 0, idleSeconds: 0 },
      path: m.at ? [m.at] : [],
      end: null,
    };
  }

  private drive(m: TripMoment): EcoTip | undefined {
    const trip = this.trip as Trip;
    trip.endedAt = m.now;
    trip.from ||= m.street;
    trip.distanceKm += (m.speedKmh * m.seconds) / 3600;
    trip.fuelL += ((m.rateLph ?? 0) * m.seconds) / 3600;
    trip.maxSpeedKmh = Math.max(trip.maxSpeedKmh, m.speedKmh);
    trip.cost = trip.fuelL * trip.fuelPrice;
    const last = trip.path[trip.path.length - 1];
    if (m.at && (!last || metres(last, m.at) > POINT_STEP_M) && trip.path.length < MAX_POINTS) {
      trip.path.push(m.at);
    }
    const tip = this.style(m, trip.driving);
    trip.score = ecoScore(trip.distanceKm, trip.driving);
    return tip;
  }

  private style(m: TripMoment, style: DrivingStyle): EcoTip | undefined {
    const raw = (m.speedKmh - this.lastSpeed) / 3.6 / Math.max(m.seconds, 0.05);
    this.lastSpeed = m.speedKmh;
    this.acceleration += (raw - this.acceleration) * 0.35;
    let tip: EcoTip | undefined;
    /** Counts once when a state has lasted long enough. */
    const lasted = (before: number, limit: number) => before + m.seconds >= limit && before < limit;

    if (this.acceleration > HARD_ACCELERATION && m.speedKmh > 5) {
      if (lasted(this.accelerating, 0.6)) {
        style.hardAccelerations++;
        tip = 'accelerate';
      }
      this.accelerating += m.seconds;
    } else this.accelerating = 0;

    if (this.acceleration < HARD_BRAKING && m.speedKmh > 5) {
      if (lasted(this.braking, 0.4)) {
        style.hardBrakings++;
        tip = 'brake';
      }
      this.braking += m.seconds;
    } else this.braking = 0;

    const canShift = m.gear !== null && m.gear > 0 && m.gear < m.gears;
    if (canShift && m.rpm > HIGH_RPM && (m.throttle ?? 0) < 60) {
      style.highRpmSeconds += m.seconds;
      this.highRpm += m.seconds;
      if (this.highRpm > 4) tip = 'shift';
    } else this.highRpm = 0;

    if (m.speedKmh < 1 && m.rpm > 500) {
      style.idleSeconds += m.seconds;
      this.idle += m.seconds;
      if (this.idle > 60) tip = 'idle';
    } else this.idle = 0;

    if (!tip || m.now - (this.tips.get(tip) ?? -Infinity) < TIP_PAUSE_MS) return undefined;
    this.tips.set(tip, m.now);
    return tip;
  }

  private finish(m: TripMoment): Trip | undefined {
    const trip = this.trip;
    this.trip = null;
    this.stoppedS = 0;
    if (!trip || trip.distanceKm < MIN_TRIP_KM) return undefined;
    trip.to = m.street;
    trip.end = m.at ?? trip.path[trip.path.length - 1] ?? null;
    return trip;
  }
}

function metres(a: Coordinate, b: Coordinate): number {
  const x = (b[0] - a[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot(x, (b[1] - a[1]) * 110540);
}

export interface TripSummary {
  readonly count: number;
  readonly distanceKm: number;
  readonly fuelL: number;
  readonly cost: number;
  readonly per100Km: number | null;
  readonly score: number | null;
}

export function summarize(trips: readonly Trip[]): TripSummary {
  const sum = (value: (trip: Trip) => number) => trips.reduce((total, t) => total + value(t), 0);
  const distanceKm = sum((trip) => trip.distanceKm);
  const fuelL = sum((trip) => trip.fuelL);
  return {
    count: trips.length,
    distanceKm,
    fuelL,
    cost: sum((trip) => trip.cost),
    per100Km: distanceKm > 1 && fuelL > 0 ? (fuelL / distanceKm) * 100 : null,
    score: trips.length ? Math.round(sum((trip) => trip.score) / trips.length) : null,
  };
}

/** Month of a trip, e.g. 2026-11. */
export function monthOf({ startedAt }: Trip): string {
  const date = new Date(startedAt);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Table for spreadsheets, oldest first. */
export function toCsv(trips: readonly Trip[], header: readonly string[]): string {
  // A text starting like a formula must not become one.
  const text = (value: string) => `"${value.replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`;
  const two = (n: number) => String(n).padStart(2, '0');
  const rows = [...trips]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((trip) => {
      const start = new Date(trip.startedAt);
      const end = new Date(trip.endedAt);
      return [
        `${two(start.getDate())}.${two(start.getMonth() + 1)}.${start.getFullYear()}`,
        `${two(start.getHours())}:${two(start.getMinutes())}`,
        `${two(end.getHours())}:${two(end.getMinutes())}`,
        text(trip.from),
        text(trip.to),
        trip.distanceKm.toFixed(1),
        Math.round((trip.endedAt - trip.startedAt) / 60_000),
        trip.fuelL.toFixed(2),
        trip.cost.toFixed(2),
        trip.distanceKm > 1 ? ((trip.fuelL / trip.distanceKm) * 100).toFixed(1) : '',
        trip.score,
      ].join(';');
    });
  return [header.map(text).join(';'), ...rows].join('\n');
}

/** Trip record of the prototype (IndexedDB `picasso-drive`, store `trip`). */
export interface LegacyTrip {
  id: number;
  t0?: number;
  t1?: number;
  dist?: number;
  fuel?: number;
  vmax?: number;
  hA?: number;
  hB?: number;
  rpmS?: number;
  idleS?: number;
  p?: [number, number][];
  from?: string;
  to?: string;
  src?: string;
  price?: number;
  score?: number;
  cost?: number;
  end?: [number, number] | null;
}

export function tripFromLegacy(legacy: LegacyTrip): Trip {
  const driving: DrivingStyle = {
    hardAccelerations: legacy.hA ?? 0,
    hardBrakings: legacy.hB ?? 0,
    highRpmSeconds: legacy.rpmS ?? 0,
    idleSeconds: legacy.idleS ?? 0,
  };
  const distanceKm = legacy.dist ?? 0;
  const fuelL = legacy.fuel ?? 0;
  const fuelPrice = legacy.price ?? 0;
  const path = legacy.p ?? [];
  return {
    id: legacy.id,
    startedAt: legacy.t0 ?? legacy.id,
    endedAt: legacy.t1 ?? legacy.t0 ?? legacy.id,
    distanceKm,
    fuelL,
    maxSpeedKmh: legacy.vmax ?? 0,
    from: legacy.from ?? '',
    to: legacy.to ?? '',
    source: legacy.src === 'obd' || legacy.src === 'demo' ? legacy.src : 'gps',
    fuelPrice,
    cost: legacy.cost ?? fuelL * fuelPrice,
    score: legacy.score ?? ecoScore(distanceKm, driving),
    driving,
    path,
    end: legacy.end ?? path[path.length - 1] ?? null,
  };
}

/** Port: where trips are kept. */
export abstract class TripRepository {
  abstract all(): Promise<Trip[]>;
  abstract save(trip: Trip): Promise<void>;
  abstract delete(id: number): Promise<void>;
  /** Null if none were measured or they are too old. */
  abstract values(id: number): Promise<TripValues | null>;
  abstract saveValues(values: TripValues): Promise<void>;
  /** Drops the values of trips that began earlier. */
  abstract pruneValues(before: number): Promise<void>;
}
