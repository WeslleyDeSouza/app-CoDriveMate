import { Quantity, Units, fuelRateIn, speedIn, temperatureIn } from '@shared/kernel/units';
import { Series, SeriesKey } from '../domain/history';

const CONVERT: Partial<Record<SeriesKey, (value: number, units: Units) => Quantity>> = {
  speed: speedIn,
  coolantTemp: temperatureIn,
  consumption: fuelRateIn,
};
const UNIT: Partial<Record<SeriesKey, string>> = { rpm: '1/min', throttle: '%', voltage: 'V' };

export function seriesUnit({ key }: Series, units: Units): string {
  return CONVERT[key]?.(0, units).unit ?? UNIT[key] ?? '';
}

/** A value in the chosen unit, without the unit. */
export function seriesText({ key, digits }: Series, value: number, units: Units): string {
  return (CONVERT[key]?.(value, units).value ?? value).toFixed(digits);
}
