import {
  METRIC,
  Units,
  consumptionIn,
  distanceIn,
  formatDistanceIn,
  fuelRateIn,
  pressureIn,
  speedIn,
  temperatureIn,
  volumeIn,
} from './units';

const US: Units = {
  distance: 'mi',
  temperature: 'f',
  consumption: 'mpgUs',
  volume: 'galUs',
  pressure: 'psi',
};

describe('units', () => {
  it('leaves metric values alone', () => {
    expect(speedIn(50, METRIC)).toEqual({ value: 50, unit: 'km/h' });
    expect(temperatureIn(90, METRIC)).toEqual({ value: 90, unit: '°C' });
    expect(consumptionIn(7, METRIC)).toEqual({ value: 7, unit: 'l/100' });
    expect(fuelRateIn(2, METRIC)).toEqual({ value: 2, unit: 'l/h' });
    expect(pressureIn(101, METRIC)).toEqual({ value: 101, unit: 'kPa' });
  });

  it('converts', () => {
    expect(speedIn(100, US).value).toBeCloseTo(62.14, 2);
    expect(distanceIn(1.609344, US)).toEqual({ value: 1, unit: 'mi' });
    expect(temperatureIn(100, US)).toEqual({ value: 212, unit: '°F' });
    expect(volumeIn(3.785411784, US)).toEqual({ value: 1, unit: 'gal' });
    expect(consumptionIn(7, US).value).toBeCloseTo(33.6, 1);
    expect(consumptionIn(7, { ...US, consumption: 'mpgUk' }).value).toBeCloseTo(40.35, 1);
    expect(consumptionIn(8, { ...US, consumption: 'kml' }).value).toBe(12.5);
    expect(consumptionIn(0, US).value).toBe(0);
    expect(pressureIn(100, US).value).toBeCloseTo(14.5, 1);
    expect(pressureIn(100, { ...US, pressure: 'bar' }).value).toBe(1);
  });

  it('rounds distances for guidance', () => {
    expect(formatDistanceIn(4, METRIC)).toBe('10 m');
    expect(formatDistanceIn(1540, METRIC)).toBe('1.5 km');
    expect(formatDistanceIn(100, US)).toBe('350 ft');
    expect(formatDistanceIn(1609.344, US)).toBe('1.0 mi');
  });
});
