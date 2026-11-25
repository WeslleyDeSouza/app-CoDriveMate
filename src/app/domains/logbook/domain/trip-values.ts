export const VALUE_KEYS = [
  'speed',
  'rpm',
  'coolantTemp',
  'consumption',
  'throttle',
  'voltage',
] as const;
export type ValueKey = (typeof VALUE_KEYS)[number];
export type Values = Readonly<Record<ValueKey, number | null>>;

export interface ValueStats {
  readonly min: number;
  readonly max: number;
  readonly average: number;
}
export type TripStats = Partial<Record<ValueKey, ValueStats>>;

/** What was measured during a trip. */
export interface TripValues {
  /** id of the trip */
  readonly id: number;
  /** seconds since the start of the trip, per point */
  readonly seconds: readonly number[];
  readonly values: Readonly<Record<ValueKey, readonly (number | null)[]>>;
}

const STEP_MS = 5000;
/** Longer than this without a point means: the adapter was gone. */
const GAP_S = 20;
/** Half a day of driving in one piece. */
const MAX_POINTS = 8640;
/** Points are kept this long, their statistics for ever. */
export const VALUES_MAX_AGE_MS = 90 * 86_400_000;

interface Sum {
  min: number;
  max: number;
  sum: number;
  weight: number;
}

/** Collects the values of the trip going on. */
export class TripValueRecorder {
  private id = 0;
  private lastPoint = -Infinity;
  private seconds: number[] = [];
  private values = emptyLists();
  private sums: Partial<Record<ValueKey, Sum>> = {};

  /** `elapsedS` is the time this moment stands for. */
  add(id: number, now: number, elapsedS: number, sample: Values): void {
    if (id !== this.id) this.begin(id);
    for (const key of VALUE_KEYS) {
      const value = sample[key];
      if (value === null || !Number.isFinite(value)) continue;
      const sum = (this.sums[key] ??= { min: value, max: value, sum: 0, weight: 0 });
      sum.min = Math.min(sum.min, value);
      sum.max = Math.max(sum.max, value);
      sum.sum += value * elapsedS;
      sum.weight += elapsedS;
    }
    if (now - this.lastPoint < STEP_MS || this.seconds.length >= MAX_POINTS) return;
    this.lastPoint = now;
    this.seconds.push(Math.round((now - id) / 1000));
    for (const key of VALUE_KEYS) {
      const value = sample[key];
      const usable = value !== null && Number.isFinite(value);
      this.values[key].push(usable ? Math.round(value * 10) / 10 : null);
    }
  }

  /** Null if nothing was measured during this trip. */
  points(id: number): TripValues | null {
    if (id !== this.id || !this.seconds.length) return null;
    const values = emptyLists();
    for (const key of VALUE_KEYS) values[key] = [...this.values[key]];
    return { id, seconds: [...this.seconds], values };
  }

  stats(id: number): TripStats {
    if (id !== this.id) return {};
    const stats: TripStats = {};
    for (const key of VALUE_KEYS) {
      const sum = this.sums[key];
      if (!sum?.weight) continue;
      stats[key] = { min: sum.min, max: sum.max, average: sum.sum / sum.weight };
    }
    return stats;
  }

  private begin(id: number): void {
    this.id = id;
    this.lastPoint = -Infinity;
    this.seconds = [];
    this.values = emptyLists();
    this.sums = {};
  }
}

function emptyLists(): Record<ValueKey, (number | null)[]> {
  return { speed: [], rpm: [], coolantTemp: [], consumption: [], throttle: [], voltage: [] };
}

interface Scale {
  readonly min: number;
  readonly max: number;
  readonly width: number;
  readonly height: number;
}

const yOf = (value: number, { min, max, height }: Scale) =>
  (height * (1 - Math.max(0, Math.min(1, (value - min) / (max - min))))).toFixed(1);

/** Line of one trip over its time (SVG path data); gaps where nothing was measured. */
export function tripPath({ seconds, values }: TripValues, key: ValueKey, scale: Scale): string {
  const end = seconds[seconds.length - 1] || 1;
  let path = '';
  let before: number | null = null;
  seconds.forEach((second, i) => {
    const value = values[key][i];
    if (value === null || value === undefined) {
      before = null;
      return;
    }
    const drawing = before !== null && second - before <= GAP_S;
    const x = ((scale.width * second) / end).toFixed(1);
    path += `${drawing ? 'L' : 'M'}${x} ${yOf(value, scale)}`;
    before = second;
  });
  return path;
}

/** One column per trip: from lowest to highest, and a line through the averages. */
export function trendPaths(
  stats: readonly (ValueStats | null)[],
  scale: Scale,
): { line: string; bars: string } {
  let line = '';
  let bars = '';
  let drawing = false;
  stats.forEach((one, i) => {
    if (!one) return;
    const x = ((scale.width * (i + 0.5)) / stats.length).toFixed(1);
    if (one.max > one.min) bars += `M${x} ${yOf(one.min, scale)}L${x} ${yOf(one.max, scale)}`;
    line += `${drawing ? 'L' : 'M'}${x} ${yOf(one.average, scale)}`;
    drawing = true;
  });
  // A single point is drawn as a dot.
  if (line && !line.includes('L')) line += 'h0.1';
  return { line, bars };
}

export type Period = 'day' | 'week' | 'month';

/** Start and end of a period; `back` counts periods into the past. Weeks begin on Monday. */
export function periodRange(period: Period, back: number, now: number): [from: number, to: number] {
  const date = new Date(now);
  const [year, month, day] = [date.getFullYear(), date.getMonth(), date.getDate()];
  const at = (y: number, m: number, d: number) => new Date(y, m, d).getTime();
  if (period === 'month') return [at(year, month - back, 1), at(year, month - back + 1, 1)];
  const days = period === 'week' ? 7 : 1;
  const first = (period === 'week' ? day - ((date.getDay() + 6) % 7) : day) - back * days;
  return [at(year, month, first), at(year, month, first + days)];
}
