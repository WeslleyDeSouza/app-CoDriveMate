import { estimateGear } from './gear';
import { HISTORY_LENGTH, SERIES, Sample, pathOf, withSample } from './history';
import { XSARA_PICASSO } from './vehicle-profile';

describe('gear', () => {
  const gear = (speed: number, rpm: number) => estimateGear(speed, rpm, XSARA_PICASSO.gearRatios);

  it('follows from speed and rpm', () => {
    expect(gear(0, 800)).toBe(0);
    expect(gear(15, 2000)).toBe(1);
    expect(gear(52, 2000)).toBe(4);
    expect(gear(99, 3000)).toBe(5);
    expect(gear(80, 800)).toBeNull(); // clutch
    expect(estimateGear(50, 2000, [])).toBeNull();
  });
});

describe('history', () => {
  const sample = (speed: number | null): Sample => ({
    speed,
    rpm: null,
    coolantTemp: null,
    consumption: null,
    throttle: null,
    voltage: null,
  });

  it('keeps two minutes', () => {
    let history: Sample[] = [];
    for (let i = 0; i < 250; i++) history = withSample(history, sample(i));
    expect(history).toHaveLength(HISTORY_LENGTH);
    expect(history[HISTORY_LENGTH - 1].speed).toBe(249);
  });

  it('draws the newest value at the right, with gaps', () => {
    const path = pathOf([sample(0), sample(null), sample(200)], SERIES[0], 199, 100);
    expect(path).toBe('M197.0 100.0M199.0 0.0');
  });
});
