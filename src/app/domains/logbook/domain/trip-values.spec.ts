import { TripValueRecorder, Values, periodRange, trendPaths, tripPath } from './trip-values';

const NONE: Values = {
  speed: null,
  rpm: null,
  coolantTemp: null,
  consumption: null,
  throttle: null,
  voltage: null,
};
const SCALE = { min: 0, max: 100, width: 100, height: 100 };

describe('values of a trip', () => {
  it('are kept every five seconds, the statistics see everything', () => {
    const recorder = new TripValueRecorder();
    for (let i = 0; i <= 40; i++) {
      recorder.add(1000, 1000 + i * 250, 0.25, { ...NONE, speed: i === 3 ? 99 : 50 });
    }
    const points = recorder.points(1000);
    expect(points?.seconds).toEqual([0, 5, 10]);
    expect(points?.values.speed).toEqual([50, 50, 50]);
    expect(points?.values.voltage).toEqual([null, null, null]);
    expect(recorder.stats(1000).speed).toMatchObject({ min: 50, max: 99 });
    expect(recorder.stats(1000).voltage).toBeUndefined();
  });

  it('begin anew with every trip', () => {
    const recorder = new TripValueRecorder();
    recorder.add(1, 1, 1, { ...NONE, speed: 10 });
    recorder.add(2, 2, 1, { ...NONE, speed: 20 });
    expect(recorder.points(1)).toBeNull();
    expect(recorder.stats(1)).toEqual({});
    expect(recorder.stats(2).speed?.min).toBe(20);
  });

  it('are drawn with gaps', () => {
    const speed = [0, 50, null, 100, 100];
    const none = { rpm: [], coolantTemp: [], consumption: [], throttle: [], voltage: [] };
    const seconds = [0, 5, 10, 15, 100];
    const path = tripPath({ id: 1, seconds, values: { ...none, speed } }, 'speed', SCALE);
    expect(path).toBe('M0.0 100.0L5.0 50.0M15.0 0.0M100.0 0.0');
  });

  it('are compared trip by trip', () => {
    const { line, bars } = trendPaths(
      [{ min: 0, max: 100, average: 50 }, null, { min: 20, max: 20, average: 20 }],
      SCALE,
    );
    expect(line).toBe('M16.7 50.0L83.3 80.0');
    expect(bars).toBe('M16.7 100.0L16.7 0.0');
    expect(trendPaths([{ min: 1, max: 1, average: 1 }], SCALE).line).toContain('h0.1');
  });
});

describe('periods', () => {
  const now = new Date(2026, 10, 25, 15).getTime(); // a Wednesday
  const at = (month: number, day: number) => new Date(2026, month - 1, day).getTime();

  it('begin at midnight, on Monday and on the first', () => {
    expect(periodRange('day', 0, now)).toEqual([at(11, 25), at(11, 26)]);
    expect(periodRange('day', 25, now)).toEqual([at(10, 31), at(11, 1)]);
    expect(periodRange('week', 0, now)).toEqual([at(11, 23), at(11, 30)]);
    expect(periodRange('week', 4, now)).toEqual([at(10, 26), at(11, 2)]);
    expect(periodRange('month', 1, now)).toEqual([at(10, 1), at(11, 1)]);
  });

  it('count a Sunday to the week that ends', () => {
    const sunday = new Date(2026, 10, 29, 10).getTime();
    expect(periodRange('week', 0, sunday)[0]).toBe(at(11, 23));
  });
});
