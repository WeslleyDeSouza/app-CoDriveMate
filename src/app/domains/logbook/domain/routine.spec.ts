import { Coordinate } from './trip';
import { RoutineDrive, findRoutines, routineNow } from './routine';

const HOME: Coordinate = [8.54, 47.37];
const GYM: Coordinate = [8.56, 47.38];
const WORK: Coordinate = [8.5, 47.4];
/** Flat enough for a few kilometres. */
const distanceM = (a: Coordinate, b: Coordinate) =>
  Math.hypot((a[0] - b[0]) * 75_000, (a[1] - b[1]) * 111_000);

/** Monday 23.11.2026 is the first day; `day` counts on from there. */
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, 23 + day, hour, minute).getTime();
const drive = (day: number, hour: number, minute = 0, end = GYM, to = 'Fitness'): RoutineDrive => ({
  startedAt: at(day, hour, minute),
  from: HOME,
  end,
  to,
});

describe('routines', () => {
  const now = at(14, 4, 50);

  it('are found in drives from the same place to the same destination at about the same time', () => {
    const drives = [
      drive(0, 5, 10),
      drive(1, 5, 30),
      drive(2, 5, 5),
      drive(3, 5, 40),
      drive(4, 5, 20),
    ];
    const [routine] = findRoutines(drives, now, distanceM);
    expect(routine).toMatchObject({ name: 'Fitness', earliest: 305, latest: 340, count: 5 });
    expect(routine.days).toEqual([1, 2, 3, 4, 5]);
  });

  it('need three drives, recent ones, and a different time makes another habit', () => {
    const drives = [drive(0, 5), drive(1, 5), drive(2, 18), drive(3, 18), drive(4, 18)];
    expect(findRoutines(drives, now, distanceM).map(({ earliest }) => earliest)).toEqual([1080]);
    expect(findRoutines(drives, at(80, 5), distanceM)).toEqual([]);
  });

  it('keep destinations apart', () => {
    const drives = [
      drive(0, 7),
      drive(1, 7),
      drive(2, 7, 0, WORK, 'Büro'),
      drive(3, 7, 0, WORK, 'Büro'),
    ];
    expect(findRoutines(drives, now, distanceM)).toEqual([]);
  });

  it('are suggested at the usual place, shortly before the usual time, on the usual days', () => {
    const drives = [0, 1, 2, 3, 4, 7, 8].map((day) => drive(day, 5, 15));
    const routines = findRoutines(drives, now, distanceM);
    // Monday 4:50 at home.
    expect(routineNow(routines, HOME, at(14, 4, 50), distanceM)?.name).toBe('Fitness');
    expect(routineNow(routines, HOME, at(14, 4, 30), distanceM)).toBeNull();
    expect(routineNow(routines, HOME, at(14, 6, 0), distanceM)).toBeNull();
    // Saturday: never driven then.
    expect(routineNow(routines, HOME, at(12, 5, 0), distanceM)).toBeNull();
    // Somewhere else.
    expect(routineNow(routines, WORK, at(14, 5, 0), distanceM)).toBeNull();
  });

  it('with few drives, tell only working days from weekends', () => {
    const routines = findRoutines([drive(0, 5), drive(1, 5), drive(2, 5)], now, distanceM);
    expect(routineNow(routines, HOME, at(10, 5, 0), distanceM)).not.toBeNull(); // Thursday
    expect(routineNow(routines, HOME, at(12, 5, 0), distanceM)).toBeNull(); // Saturday
  });
});
