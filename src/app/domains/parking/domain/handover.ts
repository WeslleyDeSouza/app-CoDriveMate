import { LonLat } from './parking';

/** Address that opens the place in the map app of a phone, walking. */
export function phoneLink([lon, lat]: LonLat, kind: 'apple' | 'google'): string {
  const at = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  return kind === 'apple'
    ? `https://maps.apple.com/?daddr=${at}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(at)}&travelmode=walking`;
}

export interface CarPark {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly at: LonLat;
}

/** Port: car parks around a place; rejects without a connection. */
export abstract class CarParkSource {
  abstract around(at: LonLat): Promise<CarPark[]>;
}
