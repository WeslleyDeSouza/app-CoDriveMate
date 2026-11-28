import { Coordinate, distanceM, move } from './geo';
import { NearRoad, matchRoad } from './road-match';

const START: Coordinate = [8.5, 47.4];
const north: NearRoad = { oneway: 0, points: [START, move(START, 0, 400)] };

describe('matchRoad', () => {
  it('finds the place on the road and its direction, the way the car drives', () => {
    const beside = move(move(START, 0, 100), 90, 20);
    const up = matchRoad([north], beside, 10, 30)!;
    expect(distanceM(up.coordinate, move(START, 0, 100))).toBeLessThan(1);
    expect(up.heading).toBeCloseTo(0, 0);
    expect(matchRoad([north], beside, 170, 30)!.heading).toBeCloseTo(180, 0);
  });

  it('gives no direction when the direction of travel is unknown', () => {
    expect(matchRoad([north], move(START, 90, 10), null, 30)!.heading).toBeNull();
  });

  it('finds nothing too far away', () => {
    expect(matchRoad([north], move(START, 90, 50), 0, 30)).toBeNull();
  });

  it('does not take a road that crosses the direction of travel', () => {
    expect(matchRoad([north], move(START, 0, 100), 90, 30)).toBeNull();
  });

  it('does not take a one-way road against its direction', () => {
    const down: NearRoad = { ...north, oneway: -1 };
    expect(matchRoad([down], move(START, 0, 100), 0, 30)).toBeNull();
    expect(matchRoad([down], move(START, 0, 100), 180, 30)!.heading).toBeCloseTo(180, 0);
  });

  it('prefers the road that points like the car over a nearer one that hardly does', () => {
    const at = move(START, 0, 100);
    const slanted: NearRoad = { oneway: 0, points: [move(at, 230, 100), move(at, 50, 100)] };
    const beside = move(at, 90, 6);
    expect(matchRoad([slanted, north], beside, 0, 30)!.heading).toBeCloseTo(0, 0);
  });
});
