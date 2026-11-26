import { Coordinate } from './trip';

/** What a drive needs to give for finding habits. */
export interface RoutineDrive {
  readonly startedAt: number;
  readonly from: Coordinate | null;
  readonly end: Coordinate | null;
  readonly to: string;
}

/** A drive that comes back: same start, same destination, about the same time. */
export interface Routine {
  readonly from: Coordinate;
  readonly at: Coordinate;
  /** name of the destination, of the newest drive */
  readonly name: string;
  /** minutes after midnight, earliest and latest start */
  readonly earliest: number;
  readonly latest: number;
  /** days of the week it was driven, 0 = Sunday */
  readonly days: readonly number[];
  readonly count: number;
}

const SAME_PLACE_M = 300;
/** Starts this far apart in time still belong to one habit. */
const SAME_TIME_MIN = 45;
const MIN_DRIVES = 3;
/** Older drives say less about the habits of today. */
const RECENT_DAYS = 56;
/** Nothing to suggest on the doorstep. */
const MIN_AWAY_M = 1000;
/** Before the earliest start the suggestion may come this early. */
const AHEAD_MIN = 30;
const LATE_MIN = 20;
/** With this many drives, the days of the week count one by one. */
const DAYS_FROM = 5;

type Distance = (a: Coordinate, b: Coordinate) => number;

const minuteOf = (time: number) => {
  const date = new Date(time);
  return date.getHours() * 60 + date.getMinutes();
};
const isWeekend = (day: number) => day === 0 || day === 6;

/** Habits in the drives, the most frequent first. Worked out on the device only. */
export function findRoutines(
  drives: readonly RoutineDrive[],
  now: number,
  distanceM: Distance,
): Routine[] {
  const recent = drives.filter(
    (d): d is RoutineDrive & { from: Coordinate; end: Coordinate } =>
      !!d.from &&
      !!d.end &&
      !!d.to &&
      now - d.startedAt < RECENT_DAYS * 86_400_000 &&
      distanceM(d.from, d.end) >= MIN_AWAY_M,
  );
  // Same start and same destination.
  const pairs: { from: Coordinate; end: Coordinate; drives: typeof recent }[] = [];
  for (const drive of recent) {
    const pair = pairs.find(
      ({ from, end }) =>
        distanceM(from, drive.from) <= SAME_PLACE_M && distanceM(end, drive.end) <= SAME_PLACE_M,
    );
    if (pair) pair.drives.push(drive);
    else pairs.push({ from: drive.from, end: drive.end, drives: [drive] });
  }
  const routines: Routine[] = [];
  for (const pair of pairs) {
    // Within a pair, starts close in time form one habit.
    const sorted = [...pair.drives].sort((a, b) => minuteOf(a.startedAt) - minuteOf(b.startedAt));
    let group: typeof sorted = [];
    const close = () => {
      if (group.length >= MIN_DRIVES) routines.push(routineOf(pair.from, pair.end, group));
      group = [];
    };
    for (const drive of sorted) {
      const last = group[group.length - 1];
      if (last && minuteOf(drive.startedAt) - minuteOf(last.startedAt) > SAME_TIME_MIN) close();
      group.push(drive);
    }
    close();
  }
  return routines.sort((a, b) => b.count - a.count);
}

function routineOf(
  from: Coordinate,
  at: Coordinate,
  drives: readonly (RoutineDrive & { end: Coordinate })[],
): Routine {
  const minutes = drives.map(({ startedAt }) => minuteOf(startedAt));
  const newest = drives.reduce((a, b) => (b.startedAt > a.startedAt ? b : a));
  const days = [...new Set(drives.map(({ startedAt }) => new Date(startedAt).getDay()))].sort();
  return {
    from,
    at,
    name: newest.to,
    earliest: Math.min(...minutes),
    latest: Math.max(...minutes),
    days,
    count: drives.length,
  };
}

/** The habit that fits here and now; null if none does. */
export function routineNow(
  routines: readonly Routine[],
  here: Coordinate,
  now: number,
  distanceM: Distance,
): Routine | null {
  const minute = minuteOf(now);
  const day = new Date(now).getDay();
  return (
    routines.find((routine) => {
      if (distanceM(routine.from, here) > SAME_PLACE_M) return false;
      if (minute < routine.earliest - AHEAD_MIN || minute > routine.latest + LATE_MIN) return false;
      return routine.count >= DAYS_FROM
        ? routine.days.includes(day)
        : routine.days.some((one) => isWeekend(one) === isWeekend(day));
    }) ?? null
  );
}
