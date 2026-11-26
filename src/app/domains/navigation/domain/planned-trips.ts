import { SavedPlace } from './saved-places';

/** Why the driver goes somewhere, in their own words. */
export interface TripPurpose {
  /** short, e.g. "Schwimmen" */
  readonly topic: string;
  /** anything else worth knowing, '' if nothing */
  readonly note: string;
}

/**
 * A destination saved for later, with what it is about. Kept like a saved place:
 * without coordinates of Mapbox or Google, which are looked up again.
 */
export interface PlannedTrip extends TripPurpose {
  readonly id: string;
  readonly place: SavedPlace;
  /** local day `YYYY-MM-DD`; null: any day */
  readonly day: string | null;
  /** shown for one tap next to home and work */
  readonly favourite: boolean;
  readonly createdAt: number;
}

export type TripWhen = 'today' | 'upcoming' | 'anytime' | 'past';

export const MAX_TOPIC = 60;
export const MAX_NOTE = 300;
const MAX_TRIPS = 50;

/** The local day of a time, `YYYY-MM-DD`. */
export function dayOf(time: number): string {
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isDay(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text));
}

/** Topic and note trimmed and cut to a length that fits a sentence. */
export function cleanPurpose(topic: string, note: string): TripPurpose {
  const clean = (text: string, max: number) => text.replace(/\s+/g, ' ').trim().slice(0, max);
  return { topic: clean(topic, MAX_TOPIC), note: clean(note, MAX_NOTE) };
}

export function hasPurpose(purpose: TripPurpose | undefined | null): purpose is TripPurpose {
  return !!purpose && !!(purpose.topic || purpose.note);
}

export function whenOf({ day }: PlannedTrip, today: string): TripWhen {
  if (!day) return 'anytime';
  return day === today ? 'today' : day > today ? 'upcoming' : 'past';
}

const ORDER: Record<TripWhen, number> = { today: 0, upcoming: 1, anytime: 2, past: 3 };

/** Today first, then the next days, then those for any day, then the past ones. */
export function sortedTrips(trips: readonly PlannedTrip[], today: string): PlannedTrip[] {
  return [...trips].sort((a, b) => {
    const when = ORDER[whenOf(a, today)] - ORDER[whenOf(b, today)];
    if (when) return when;
    if (whenOf(a, today) === 'upcoming') return (a.day ?? '').localeCompare(b.day ?? '');
    if (whenOf(a, today) === 'past') return (b.day ?? '').localeCompare(a.day ?? '');
    return b.createdAt - a.createdAt;
  });
}

/** Planned for today, the earliest saved first. */
export function dueToday(trips: readonly PlannedTrip[], today: string): PlannedTrip[] {
  return trips.filter((trip) => trip.day === today).sort((a, b) => a.createdAt - b.createdAt);
}

/** Favourites for one tap, by their topic or name. */
export function favouriteTrips(trips: readonly PlannedTrip[]): PlannedTrip[] {
  return trips
    .filter(({ favourite }) => favourite)
    .sort((a, b) => (a.topic || a.place.name).localeCompare(b.topic || b.place.name));
}

/** Adds a trip or replaces the one with the same id; the oldest go when there are too many. */
export function withTrip(trips: readonly PlannedTrip[], trip: PlannedTrip): PlannedTrip[] {
  const others = trips.filter(({ id }) => id !== trip.id);
  return [trip, ...others].slice(0, MAX_TRIPS);
}

export function withoutTrip(trips: readonly PlannedTrip[], id: string): PlannedTrip[] {
  return trips.filter((trip) => trip.id !== id);
}

/** For the language model: the driver's words are data, never instructions. */
export function purposeText({ topic, note }: TripPurpose): string {
  return [topic ? `reason: "${topic}"` : '', note ? `driver's note: "${note}"` : '']
    .filter(Boolean)
    .join(', ');
}

/** Stored trips of an older or broken shape are left out, not repaired by guessing. */
export function validTrips(stored: unknown): PlannedTrip[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (trip): trip is PlannedTrip =>
      !!trip &&
      typeof trip.id === 'string' &&
      typeof trip.place?.name === 'string' &&
      typeof trip.topic === 'string' &&
      typeof trip.note === 'string' &&
      typeof trip.favourite === 'boolean' &&
      (trip.day === null || (typeof trip.day === 'string' && isDay(trip.day))),
  );
}

export const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];
const MAX_DAYS_AHEAD = 366;

/**
 * The day a spoken plan means: a weekday is the next one (today if it is that day),
 * or a number of days from today. null: any day.
 */
export function spokenDay(now: number, weekday?: string, daysFromToday?: number): string | null {
  const date = new Date(now);
  const index = WEEKDAYS.indexOf(String(weekday ?? '').toLowerCase() as Weekday);
  let ahead: number | null = null;
  if (index >= 0) ahead = (index - date.getDay() + 7) % 7;
  else if (Number.isInteger(daysFromToday) && daysFromToday! >= 0) ahead = daysFromToday!;
  if (ahead === null || ahead > MAX_DAYS_AHEAD) return null;
  date.setDate(date.getDate() + ahead);
  return dayOf(date.getTime());
}
