import { gaugeAngle, gaugeArc, gaugePoint, gaugeTicks } from './gauge';

describe('gauge', () => {
  it('turns from lower left to lower right and stops at the ends', () => {
    expect(gaugeAngle(0, 220)).toBe(-135);
    expect(gaugeAngle(110, 220)).toBe(0);
    expect(gaugeAngle(220, 220)).toBe(135);
    expect(gaugeAngle(300, 220)).toBe(135);
    expect(gaugeAngle(-5, 220)).toBe(-135);
  });

  it('puts points on the circle', () => {
    expect(gaugePoint(0, 100)).toEqual({ x: 0, y: -100 });
    expect(gaugePoint(90, 100)).toEqual({ x: 100, y: 0 });
  });

  it('numbers every second tick', () => {
    const ticks = gaugeTicks(220, 10, 80);
    expect(ticks).toHaveLength(23);
    expect(ticks.flatMap(({ label }) => label ?? [])).toEqual([
      0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220,
    ]);
  });

  it('draws arcs, long ones the long way round', () => {
    expect(gaugeArc(0, 0, 220, 90)).toBe('');
    expect(gaugeArc(0, 50, 220, 90)).toContain(' 0 0 1 ');
    expect(gaugeArc(0, 220, 220, 90)).toContain(' 0 1 1 ');
  });
});
