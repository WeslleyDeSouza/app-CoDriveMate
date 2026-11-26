import { RideFacts } from './passenger';

/** What an earlier drive needs to give for the comparison. */
export interface PastDrive {
  readonly distanceKm: number;
  readonly fuelL: number;
  /** eco score 0-100 */
  readonly score: number;
  readonly driving: { readonly hardBrakings: number; readonly hardAccelerations: number };
}

/** Averages of earlier drives, worked out on the device. */
export interface PastFigures {
  readonly drives: number;
  readonly score: number;
  /** null if no drive had a consumption */
  readonly litresPer100: number | null;
  /** hard brakings and accelerations per 10 km */
  readonly eventsPer10Km: number;
}

/** Shorter drives say little about a driving style. */
const MIN_KM = 3;
const MIN_DRIVES = 3;
/** Older drives say less about the driver of today. */
const MAX_DRIVES = 30;

/** Averages of the newest earlier drives (newest first); null if there are too few. */
export function pastFigures(drives: readonly PastDrive[]): PastFigures | null {
  const usable = drives.filter(({ distanceKm }) => distanceKm >= MIN_KM).slice(0, MAX_DRIVES);
  if (usable.length < MIN_DRIVES) return null;
  const km = usable.reduce((sum, d) => sum + d.distanceKm, 0);
  const events = usable.reduce(
    (sum, d) => sum + d.driving.hardBrakings + d.driving.hardAccelerations,
    0,
  );
  const fuelled = usable.filter(({ fuelL }) => fuelL > 0);
  const fuelKm = fuelled.reduce((sum, d) => sum + d.distanceKm, 0);
  const litres = fuelled.reduce((sum, d) => sum + d.fuelL, 0);
  return {
    drives: usable.length,
    score: Math.round(usable.reduce((sum, d) => sum + d.score, 0) / usable.length),
    litresPer100: fuelled.length >= MIN_DRIVES ? round1((litres / fuelKm) * 100) : null,
    eventsPer10Km: round1((events * 10) / km),
  };
}

/** The earlier drives in words for the language model: averages only. */
export function pastText({ drives, score, litresPer100, eventsPer10Km }: PastFigures): string {
  const fuel = litresPer100 === null ? '' : `, ${litresPer100} l/100 km`;
  return (
    `average of the last ${drives} drives: eco score ${score}${fuel}, ` +
    `${eventsPer10Km} hard brakings or accelerations per 10 km`
  );
}

/** The current drive and the earlier ones, as tips and eco notes need them. */
export interface CoachFacts extends RideFacts {
  /** eco score 0-100 of the current drive */
  readonly score: number;
  readonly litresPer100: number | null;
  readonly past: PastFigures | null;
}

/** Below this distance the figures of a drive still jump around. */
const COMPARE_KM = 5;
const COLD_ENGINE_C = 60;

const events10 = ({ hardBrakings, hardAccelerations, km }: CoachFacts) =>
  ((hardBrakings + hardAccelerations) * 10) / Math.max(MIN_KM, km);
const comparable = (f: CoachFacts) => f.km >= COMPARE_KM && f.past !== null;

type Rule<T> = readonly [T, (facts: CoachFacts) => boolean];

export type Tip =
  | 'cold'
  | 'brake_early'
  | 'gentle_start'
  | 'pause_soon'
  | 'calmer_than_usual'
  | 'busier_than_usual'
  | 'distance'
  | 'look_ahead'
  | 'phone'
  | 'tyres'
  | 'seat'
  | 'lights'
  | 'wipers'
  | 'zip';

/** About this drive first, most important first. */
const TIP_RULES: readonly Rule<Tip>[] = [
  ['cold', ({ coolantC }) => coolantC !== null && coolantC < COLD_ENGINE_C],
  ['brake_early', ({ hardBrakings }) => hardBrakings >= 2],
  ['gentle_start', ({ hardAccelerations }) => hardAccelerations >= 2],
  ['pause_soon', ({ minutes }) => minutes >= 90],
  ['calmer_than_usual', (f) => (eventsGap(f) ?? 0) <= -0.5],
  ['busier_than_usual', (f) => (eventsGap(f) ?? 0) >= 1],
];
/** For any drive, when there is nothing to say about this one. */
const GENERAL_TIPS: readonly Tip[] = [
  'distance',
  'look_ahead',
  'phone',
  'tyres',
  'seat',
  'lights',
  'wipers',
  'zip',
];

export type EcoNote =
  | 'score_better'
  | 'score_worse'
  | 'fuel_better'
  | 'fuel_worse'
  | 'shift_early'
  | 'idle'
  | 'coast'
  | 'tyre_pressure'
  | 'roof_box'
  | 'weight'
  | 'motorway'
  | 'air_con'
  | 'short_trips'
  | 'steady';

const ECO_RULES: readonly Rule<EcoNote>[] = [
  ['score_better', (f) => (scoreGap(f) ?? 0) >= 5],
  ['score_worse', (f) => (scoreGap(f) ?? 0) <= -10],
  ['fuel_better', (f) => (fuelRatio(f) ?? 1) < 0.92],
  ['fuel_worse', (f) => (fuelRatio(f) ?? 1) > 1.1],
  ['shift_early', ({ highRpmSeconds }) => highRpmSeconds >= 30],
  ['idle', ({ idleSeconds }) => idleSeconds >= 120],
];
const GENERAL_ECO: readonly EcoNote[] = [
  'coast',
  'tyre_pressure',
  'steady',
  'roof_box',
  'weight',
  'motorway',
  'air_con',
  'short_trips',
];

/** Eco score now minus the usual one; null without comparison. */
function scoreGap(f: CoachFacts): number | null {
  return comparable(f) && f.past ? f.score - f.past.score : null;
}

/** Consumption now in relation to the usual one; null without comparison. */
function fuelRatio(f: CoachFacts): number | null {
  const before = f.past?.litresPer100;
  return comparable(f) && f.litresPer100 !== null && before ? f.litresPer100 / before : null;
}

/** Hard events per 10 km now minus the usual ones; null without comparison. */
function eventsGap(f: CoachFacts): number | null {
  return comparable(f) && f.past ? events10(f) - f.past.eventsPer10Km : null;
}

/** These compare with earlier drives. */
export const PAST_NOTES: ReadonlySet<string> = new Set<Tip | EcoNote>([
  'calmer_than_usual',
  'busier_than_usual',
  'score_better',
  'score_worse',
  'fuel_better',
  'fuel_worse',
]);

function pick<T extends string>(
  rules: readonly Rule<T>[],
  general: readonly T[],
  facts: CoachFacts | null,
  made: ReadonlySet<string>,
  random: () => number,
): T | null {
  const special = facts && rules.find(([note, applies]) => !made.has(note) && applies(facts));
  if (special) return special[0];
  const open = general.filter((note) => !made.has(note));
  return open[Math.min(open.length - 1, Math.floor(random() * open.length))] ?? null;
}

/** A tip about this drive, or a general one; each once per drive. */
export function pickTip(
  facts: CoachFacts | null,
  made: ReadonlySet<string>,
  random: () => number,
): Tip | null {
  return pick(TIP_RULES, GENERAL_TIPS, facts, made, random);
}

/** A note about consumption, or a general one; each once per drive. */
export function pickEco(
  facts: CoachFacts | null,
  made: ReadonlySet<string>,
  random: () => number,
): EcoNote | null {
  return pick(ECO_RULES, GENERAL_ECO, facts, made, random);
}

/** Number of fixed sayings after a hard braking. */
export const BRAKE_QUIPS = 8;
/** Said a few seconds after the braking, when the moment is over. */
export const BRAKE_QUIP_DELAY_MS = 4000;
/** Too late, it would not fit any more. */
export const BRAKE_QUIP_MAX_MS = 30_000;
/** Not after every braking in town. */
export const BRAKE_QUIP_PAUSE_MS = 180_000;

/** One of the fixed sayings, not one of the last few. */
export function pickQuip(recent: readonly number[], random: () => number): number {
  const open = Array.from({ length: BRAKE_QUIPS }, (_, i) => i).filter((i) => !recent.includes(i));
  return open[Math.min(open.length - 1, Math.floor(random() * open.length))] ?? 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
