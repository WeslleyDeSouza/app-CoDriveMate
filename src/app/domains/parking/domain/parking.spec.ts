import { DriveEndDetector, dueReminder, parkAt, parkingFromLegacy, withMeter } from './parking';

const MIN = 60_000;

describe('parking meter', () => {
  const spot = parkAt([8.5400001234, 47.38], 'Bahnhofquai', 0, null);

  it('reminds ten minutes before and at the end, once each', () => {
    let metered = withMeter(spot, 30, 0);
    expect(dueReminder(spot, 1e12)).toBeNull();
    expect(dueReminder(metered, 19 * MIN)).toBeNull();
    expect(dueReminder(metered, 21 * MIN)).toBe('soon');
    metered = { ...metered, reminded: ['soon'] };
    expect(dueReminder(metered, 25 * MIN)).toBeNull();
    expect(dueReminder(metered, 30 * MIN)).toBe('over');
    expect(dueReminder({ ...metered, reminded: ['soon', 'over'] }, 40 * MIN)).toBeNull();
    expect(withMeter(metered, 0, 0).until).toBeNull();
  });

  it('keeps a running meter when the spot is found again', () => {
    const metered = withMeter(spot, 30, 0);
    expect(parkAt([8, 47], '', 10 * MIN, metered).until).toBe(30 * MIN);
    expect(parkAt([8, 47], '', 40 * MIN, metered).until).toBeNull();
  });

  it('reads the prototype', () => {
    expect(parkingFromLegacy({})).toBeNull();
    expect(parkingFromLegacy({ p: [8.5, 47.3], t: 5, until: 0, note: 'P2', w: { a: 1 } })).toEqual({
      at: [8.5, 47.3],
      since: 5,
      street: '',
      note: 'P2',
      until: null,
      reminded: ['soon'],
    });
  });
});

describe('end of a drive', () => {
  const sample = (s: number, speedKmh: number, rpm: number, connected = true) => ({
    now: s * 1000,
    speedKmh,
    rpm,
    connected,
  });

  it('ends when the engine is off for a while', () => {
    const detector = new DriveEndDetector();
    expect(detector.next(sample(0, 50, 2000))).toBe(false);
    expect(detector.next(sample(90, 0, 800))).toBe(false); // traffic light
    expect(detector.next(sample(100, 0, 0))).toBe(false);
    expect(detector.next(sample(125, 0, 0))).toBe(true);
    expect(detector.next(sample(200, 0, 0))).toBe(false); // only once
  });

  it('ends when the car no longer answers after standing', () => {
    const detector = new DriveEndDetector();
    detector.next(sample(0, 50, 2000));
    detector.next(sample(100, 0, 800));
    expect(detector.next(sample(101, 0, 0, false))).toBe(false);
    expect(detector.next(sample(125, 0, 0, false))).toBe(true);
  });

  it('is no end when the link drops while driving', () => {
    const detector = new DriveEndDetector();
    detector.next(sample(0, 50, 2000));
    detector.next(sample(100, 80, 2500));
    expect(detector.next(sample(160, 0, 0, false))).toBe(false);
  });

  it('is no end without a real drive', () => {
    const detector = new DriveEndDetector();
    detector.next(sample(0, 10, 900));
    expect(detector.next(sample(500, 0, 0))).toBe(false);
    expect(detector.next(sample(600, 0, 0))).toBe(false);
  });
});
