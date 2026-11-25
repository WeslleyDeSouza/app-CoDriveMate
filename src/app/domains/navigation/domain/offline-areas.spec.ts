import { Coordinate } from './geo';
import { isCovered, withArea } from './offline-areas';

const A: Coordinate = [8.5, 47.3];
const B: Coordinate = [8.6, 47.35];
const C: Coordinate = [8.8, 47.5];
const DAY = 86_400_000;

describe('offline areas', () => {
  const areas = withArea([], [A, B], 'v', 0);

  it('cover the way back and parts of the way', () => {
    expect(isCovered(areas, [B, A], 'v', false, 1)).toBe(true);
    expect(isCovered(areas, [A], 'v', false, 1)).toBe(true);
    expect(isCovered(areas, [A, C], 'v', false, 1)).toBe(false);
    expect(isCovered(areas, [], 'v', false, 1)).toBe(false);
  });

  it('do not count for another view or when they are old', () => {
    expect(isCovered(areas, [A, B], 'other', false, 1)).toBe(false);
    expect(isCovered(areas, [A, B], 'v', false, 91 * DAY)).toBe(false);
  });

  it('add up, unless only the last one is kept', () => {
    const two = withArea(areas, [B, C], 'v', 1);
    expect(isCovered(two, [A, B, C], 'v', false, 2)).toBe(true);
    expect(isCovered(two, [A, B], 'v', true, 2)).toBe(false);
  });
});
