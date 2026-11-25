import { Trip, TripMoment, TripRecorder, monthOf, summarize, toCsv } from './trip';

const BASE: TripMoment = {
  now: 0,
  seconds: 1,
  source: 'obd',
  speedKmh: 50,
  rpm: 2000,
  throttle: 20,
  gear: 3,
  gears: 5,
  rateLph: 5,
  at: [8.54, 47.38],
  street: 'Weg',
  fuelPrice: 2,
};

describe('TripRecorder', () => {
  let recorder: TripRecorder;
  let now = 0;
  const drive = (seconds: number, change: Partial<TripMoment> = {}) => {
    const events = [];
    for (let i = 0; i < seconds; i++)
      events.push(recorder.next({ ...BASE, now: (now += 1000), ...change }));
    return events;
  };

  beforeEach(() => {
    recorder = new TripRecorder();
    now = 0;
  });

  it('starts when the car moves and ends when the engine is off', () => {
    drive(5, { speedKmh: 0 });
    expect(recorder.current).toBeNull();
    drive(360);
    expect(recorder.current?.distanceKm).toBeCloseTo(5, 1);
    const [trip] = drive(60, { speedKmh: 0, rpm: 0, street: 'Ziel' }).flatMap(
      ({ finished }) => finished ?? [],
    );
    expect(trip).toMatchObject({ from: 'Weg', to: 'Ziel', source: 'obd' });
    expect(trip.cost).toBeCloseTo(trip.fuelL * 2, 6);
    expect(recorder.current).toBeNull();
  });

  it('survives a short loss of the link', () => {
    drive(120);
    drive(30, { source: null, speedKmh: 0 });
    drive(120);
    expect(recorder.current?.distanceKm).toBeCloseTo(3.3, 1);
  });

  it('forgets a trip that is too short', () => {
    drive(5);
    expect(drive(60, { speedKmh: 0, rpm: 0 }).some(({ finished }) => finished)).toBe(false);
  });

  it('counts harsh driving and gives each tip rarely', () => {
    drive(10, { speedKmh: 20 });
    const tips = [];
    for (let v = 20; v < 100; v += 16)
      tips.push(...drive(1, { speedKmh: v }).map(({ tip }) => tip));
    for (let v = 100; v > 10; v -= 18)
      tips.push(...drive(1, { speedKmh: v }).map(({ tip }) => tip));
    expect(recorder.current?.driving).toMatchObject({ hardAccelerations: 1, hardBrakings: 1 });
    expect(tips.filter(Boolean)).toEqual(['accelerate', 'brake']);
    expect(recorder.current?.score).toBeLessThan(100);
  });

  it('notices high revs only where another gear is left', () => {
    drive(10, { rpm: 3500, gear: 5 });
    expect(recorder.current?.driving.highRpmSeconds).toBe(0);
    const tips = drive(10, { rpm: 3500 }).flatMap(({ tip }) => tip ?? []);
    expect(tips).toEqual(['shift']);
  });
});

describe('logbook', () => {
  const trip = (change: Partial<Trip>): Trip => ({
    id: 1,
    startedAt: new Date(2026, 10, 24, 8, 5).getTime(),
    endedAt: new Date(2026, 10, 24, 8, 35).getTime(),
    distanceKm: 20,
    fuelL: 1.5,
    maxSpeedKmh: 80,
    from: 'A',
    to: 'B',
    source: 'obd',
    fuelPrice: 2,
    cost: 3,
    score: 80,
    driving: { hardAccelerations: 0, hardBrakings: 0, highRpmSeconds: 0, idleSeconds: 0 },
    path: [],
    end: null,
    ...change,
  });

  it('sums up', () => {
    expect(
      summarize([trip({}), trip({ score: 60, distanceKm: 10, fuelL: 0.9, cost: 1.8 })]),
    ).toEqual({
      count: 2,
      distanceKm: 30,
      fuelL: 2.4,
      cost: 4.8,
      per100Km: expect.closeTo(8, 6),
      score: 70,
    });
    expect(summarize([])).toMatchObject({ count: 0, per100Km: null, score: null });
    expect(monthOf(trip({}))).toBe('2026-11');
  });

  it('exports for spreadsheets, without formulas', () => {
    const [head, row] = toCsv([trip({ from: '=1+1', to: 'Weg "3"' })], ['Datum', 'km']).split('\n');
    expect(head).toBe('"Datum";"km"');
    expect(row).toBe(`24.11.2026;08:05;08:35;"'=1+1";"Weg ""3""";20.0;30;1.50;3.00;7.5;80`);
  });
});
