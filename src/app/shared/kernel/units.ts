/** Units for display. All data is kept metric; only the view converts. */
export interface Units {
  readonly distance: 'km' | 'mi';
  readonly temperature: 'c' | 'f';
  readonly consumption: 'l100' | 'kml' | 'mpgUs' | 'mpgUk';
  readonly volume: 'l' | 'galUs' | 'galUk';
  readonly pressure: 'kpa' | 'bar' | 'psi';
}

export const METRIC: Units = {
  distance: 'km',
  temperature: 'c',
  consumption: 'l100',
  volume: 'l',
  pressure: 'kpa',
};

export interface Quantity {
  readonly value: number;
  readonly unit: string;
}

const KM_PER_MILE = 1.609344;
const L_PER_GALLON = { l: 1, galUs: 3.785411784, galUk: 4.54609 };
const VOLUME_UNIT = { l: 'l', galUs: 'gal', galUk: 'gal' };

export function speedIn(kmh: number, units: Units): Quantity {
  return units.distance === 'km'
    ? { value: kmh, unit: 'km/h' }
    : { value: kmh / KM_PER_MILE, unit: 'mph' };
}

export function distanceIn(km: number, units: Units): Quantity {
  return units.distance === 'km'
    ? { value: km, unit: 'km' }
    : { value: km / KM_PER_MILE, unit: 'mi' };
}

export function temperatureIn(celsius: number, units: Units): Quantity {
  return units.temperature === 'c'
    ? { value: celsius, unit: '°C' }
    : { value: celsius * 1.8 + 32, unit: '°F' };
}

export function volumeIn(litres: number, units: Units): Quantity {
  return { value: litres / L_PER_GALLON[units.volume], unit: VOLUME_UNIT[units.volume] };
}

export function fuelRateIn(litresPerHour: number, units: Units): Quantity {
  const { value, unit } = volumeIn(litresPerHour, units);
  return { value, unit: unit + '/h' };
}

export function consumptionIn(litresPer100Km: number, units: Units): Quantity {
  const kmPerLitre = litresPer100Km > 0 ? 100 / litresPer100Km : 0;
  switch (units.consumption) {
    case 'kml':
      return { value: kmPerLitre, unit: 'km/l' };
    case 'mpgUs':
      return { value: (kmPerLitre / KM_PER_MILE) * L_PER_GALLON.galUs, unit: 'mpg' };
    case 'mpgUk':
      return { value: (kmPerLitre / KM_PER_MILE) * L_PER_GALLON.galUk, unit: 'mpg' };
    default:
      return { value: litresPer100Km, unit: 'l/100' };
  }
}

export function pressureIn(kpa: number, units: Units): Quantity {
  switch (units.pressure) {
    case 'bar':
      return { value: kpa / 100, unit: 'bar' };
    case 'psi':
      return { value: kpa / 6.894757, unit: 'psi' };
    default:
      return { value: kpa, unit: 'kPa' };
  }
}

/** Rounded distance for guidance: metres or feet when near. */
export function formatDistanceIn(metres: number, units: Units): string {
  if (units.distance === 'km') {
    return metres < 1000
      ? Math.max(10, Math.round(metres / 10) * 10) + ' m'
      : (metres / 1000).toFixed(1) + ' km';
  }
  const feet = metres / 0.3048;
  return feet < 1000
    ? Math.max(50, Math.round(feet / 50) * 50) + ' ft'
    : (metres / 1000 / KM_PER_MILE).toFixed(1) + ' mi';
}
