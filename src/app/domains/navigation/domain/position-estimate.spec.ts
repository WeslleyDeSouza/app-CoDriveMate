import { Coordinate, distanceM, move, polyline } from './geo';
import { PositionEstimator, PositionFix } from './position-estimate';

const START: Coordinate = [8.5, 47.4];
const fix = (coordinate: Coordinate, more: Partial<PositionFix> = {}): PositionFix => ({
  coordinate,
  heading: 0,
  accuracyM: 5,
  ...more,
});

describe('PositionEstimator', () => {
  it('takes a good fix as it is', () => {
    const estimator = new PositionEstimator();
    expect(estimator.fix(fix(START, { heading: 90 }), 50, 0)).toEqual({
      coordinate: START,
      heading: 90,
    });
  });

  it('drives on straight ahead between two fixes', () => {
    const estimator = new PositionEstimator();
    estimator.fix(fix(START), 36, 0);
    const next = estimator.advance(1, 36)!;
    expect(distanceM(START, next.coordinate)).toBeCloseTo(10, 0);
    expect(next.coordinate[1]).toBeGreaterThan(START[1]);
  });

  it('does not move while standing or without a speed', () => {
    const estimator = new PositionEstimator();
    estimator.fix(fix(START), 0, 0);
    expect(estimator.advance(1, 0)).toBeNull();
    expect(estimator.advance(1, null)).toBeNull();
  });

  it('stops driving blind after a few seconds without a route', () => {
    const estimator = new PositionEstimator();
    estimator.fix(fix(START), 36, 0);
    for (let i = 0; i < 8; i++) expect(estimator.advance(1, 36)).not.toBeNull();
    expect(estimator.advance(1, 36)).toBeNull();
  });

  it('moves a late fix forward by what was driven since', () => {
    const estimator = new PositionEstimator();
    const { coordinate } = estimator.fix(fix(START, { atMs: 1000 }), 72, 3000);
    expect(distanceM(START, coordinate)).toBeCloseTo(40, 0);
  });

  it('lets a vague fix only pull the estimate', () => {
    const estimator = new PositionEstimator();
    estimator.fix(fix(START), 30, 0);
    const vague = move(START, 90, 40);
    const { coordinate } = estimator.fix(fix(vague, { accuracyM: 80 }), 30, 0);
    expect(distanceM(START, coordinate)).toBeCloseTo(10, 0);
  });

  it('stays where it is when a vague fix wanders while the car stands', () => {
    const estimator = new PositionEstimator();
    estimator.fix(fix(START), 0, 0);
    const vague = move(START, 90, 40);
    expect(estimator.fix(fix(vague, { accuracyM: 80 }), 0, 0).coordinate).toEqual(START);
  });

  it('leaves out a very vague fix while the estimate is fresh', () => {
    const estimator = new PositionEstimator();
    estimator.fix(fix(START), 0, 0);
    const far = move(START, 90, 500);
    expect(estimator.fix(fix(far, { accuracyM: 400 }), 0, 0).coordinate).toEqual(START);
  });

  it('takes the direction from two fixes when the device gives none', () => {
    const estimator = new PositionEstimator();
    estimator.fix(fix(START, { heading: null }), 30, 0);
    const { heading } = estimator.fix(fix(move(START, 90, 50), { heading: null }), 30, 0);
    expect(heading).toBeCloseTo(90, 0);
  });

  it('works out the speed from two fixes when nobody knows it', () => {
    const estimator = new PositionEstimator();
    estimator.fix(fix(START, { atMs: 0 }), null, 0);
    estimator.fix(fix(move(START, 0, 100), { atMs: 5000 }), null, 5000);
    const before = estimator.advance(0, null)!.coordinate;
    const after = estimator.advance(1, null)!.coordinate;
    expect(distanceM(before, after)).toBeCloseTo(20, 0);
  });

  describe('with the roads nearby', () => {
    // north for 500 m, then a bend to the east
    const bend = move(START, 0, 500);
    const roads = [{ oneway: 0 as const, points: [START, bend, move(bend, 90, 500)] }];

    it('puts a vague fix onto the road and turns the car along it', () => {
      const estimator = new PositionEstimator();
      estimator.setRoads(roads);
      const beside = move(move(START, 0, 100), 90, 35);
      const { coordinate, heading } = estimator.fix(
        fix(beside, { accuracyM: 65, heading: 20 }),
        40,
        0,
      );
      expect(distanceM(coordinate, move(START, 0, 100))).toBeLessThan(1);
      expect(heading).toBeCloseTo(0, 0);
    });

    it('drives on along the road round the bend', () => {
      const estimator = new PositionEstimator();
      estimator.setRoads(roads);
      estimator.fix(fix(move(START, 0, 450), { accuracyM: 65 }), 36, 0);
      let last = estimator.advance(0, 36)!;
      for (let i = 0; i < 40; i++) last = estimator.advance(0.25, 36)!;
      expect(last.heading).toBeCloseTo(90, 0);
      expect(distanceM(last.coordinate, bend)).toBeGreaterThan(30);
      expect(Math.abs(last.coordinate[1] - bend[1]) * 110540).toBeLessThan(3);
    });

    it('leaves a good fix beside the road where it is', () => {
      const estimator = new PositionEstimator();
      estimator.setRoads(roads);
      const beside = move(move(START, 0, 100), 90, 30);
      expect(estimator.fix(fix(beside), 40, 0).coordinate).toEqual(beside);
    });

    it('does not put a standing car with a good fix onto the road', () => {
      const estimator = new PositionEstimator();
      estimator.setRoads(roads);
      const beside = move(move(START, 0, 100), 90, 8);
      expect(estimator.fix(fix(beside, { heading: null }), 0, 0).coordinate).toEqual(beside);
    });
  });

  describe('with a route', () => {
    // 1 km north, then 1 km east
    const corner = move(START, 0, 1000);
    const line = polyline([START, corner, move(corner, 90, 1000)]);

    it('puts a fix beside the road onto it', () => {
      const estimator = new PositionEstimator();
      estimator.follow(line);
      const beside = move(move(START, 0, 200), 90, 25);
      const { coordinate, heading } = estimator.fix(fix(beside, { heading: null }), 50, 0);
      expect(distanceM(coordinate, move(START, 0, 200))).toBeLessThan(1);
      expect(heading).toBeCloseTo(0, 0);
    });

    it('drives on round the corner', () => {
      const estimator = new PositionEstimator();
      estimator.follow(line);
      estimator.fix(fix(move(START, 0, 950)), 72, 0);
      let last = estimator.advance(0, 72)!;
      for (let i = 0; i < 5; i++) last = estimator.advance(1, 72)!;
      expect(last.heading).toBeCloseTo(90, 0);
      expect(distanceM(last.coordinate, move(corner, 90, 50))).toBeLessThan(2);
    });

    it('keeps driving along the route for longer without a fix', () => {
      const estimator = new PositionEstimator();
      estimator.follow(line);
      estimator.fix(fix(START), 36, 0);
      for (let i = 0; i < 30; i++) expect(estimator.advance(1, 36)).not.toBeNull();
    });

    it('leaves the route when a good fix is clearly beside it', () => {
      const estimator = new PositionEstimator();
      estimator.follow(line);
      estimator.fix(fix(move(START, 0, 200)), 50, 0);
      const away = move(move(START, 0, 300), 90, 120);
      expect(estimator.fix(fix(away, { heading: 90 }), 50, 0)).toEqual({
        coordinate: away,
        heading: 90,
      });
    });
  });
});
