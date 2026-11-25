import { LonLat } from './environment';

const RAD = Math.PI / 180;

export interface SunPosition {
  /** degrees above the horizon */
  readonly altitude: number;
  /** degrees, 0 = north, 90 = east */
  readonly azimuth: number;
}

/** Position of the sun, accurate to about one degree. */
export function sunPosition(date: Date, [lon, lat]: LonLat): SunPosition {
  const days = date.getTime() / 86_400_000 + 2440587.5 - 2451545;
  const anomaly = (357.529 + 0.98560028 * days) * RAD;
  const mean = 280.459 + 0.98564736 * days;
  const ecliptic = (mean + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * RAD;
  const tilt = 23.439 * RAD;
  const declination = Math.asin(Math.sin(tilt) * Math.sin(ecliptic));
  const ascension = Math.atan2(Math.cos(tilt) * Math.sin(ecliptic), Math.cos(ecliptic));
  const sidereal = (280.46061837 + 360.98564736629 * days + lon) * RAD;
  const hour = sidereal - ascension;
  const phi = lat * RAD;
  const altitude = Math.asin(
    Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination) * Math.cos(hour),
  );
  const azimuth = Math.atan2(
    -Math.sin(hour),
    Math.tan(declination) * Math.cos(phi) - Math.sin(phi) * Math.cos(hour),
  );
  return { altitude: altitude / RAD, azimuth: (azimuth / RAD + 360) % 360 };
}

/** 0 at night, 1 in full daylight. */
export function daylight(altitude: number): number {
  return Math.max(0, Math.min(1, (altitude + 6) / 14));
}

export type LightPreset = 'dawn' | 'day' | 'dusk' | 'night';

/** Light of the Mapbox Standard style. */
export function lightPreset({ altitude, azimuth }: SunPosition): LightPreset {
  if (altitude < -6) return 'night';
  if (altitude > 8) return 'day';
  return azimuth < 180 ? 'dawn' : 'dusk';
}

type Rgb = readonly [r: number, g: number, b: number];
const SKY: readonly { at: number; top: Rgb; horizon: Rgb }[] = [
  { at: -12, top: [0.015, 0.022, 0.045], horizon: [0.045, 0.06, 0.095] },
  { at: -4, top: [0.07, 0.11, 0.24], horizon: [0.42, 0.28, 0.27] },
  { at: 3, top: [0.2, 0.34, 0.58], horizon: [0.93, 0.68, 0.48] },
  { at: 14, top: [0.12, 0.32, 0.68], horizon: [0.55, 0.69, 0.81] },
];

/** Colours of the sky for a height of the sun. */
export function skyColors(altitude: number): { top: Rgb; horizon: Rgb } {
  const last = SKY[SKY.length - 1];
  if (altitude <= SKY[0].at) return SKY[0];
  if (altitude >= last.at) return last;
  const next = SKY.findIndex((entry) => entry.at > altitude);
  const [a, b] = [SKY[next - 1], SKY[next]];
  const share = (altitude - a.at) / (b.at - a.at);
  const mix = (from: Rgb, to: Rgb): Rgb => [
    from[0] + (to[0] - from[0]) * share,
    from[1] + (to[1] - from[1]) * share,
    from[2] + (to[2] - from[2]) * share,
  ];
  return { top: mix(a.top, b.top), horizon: mix(a.horizon, b.horizon) };
}
