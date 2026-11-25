import { Coordinate, Polyline, pointAt } from './geo';

export type WeatherKind = 'storm' | 'snow' | 'ice' | 'rain' | 'fog' | 'frost' | 'dry';

export interface WeatherPoint {
  readonly alongM: number;
  readonly arrivalMs: number;
  readonly temperature: number;
  readonly precipitationMm: number;
  readonly kind: WeatherKind;
  /** 0 fine, 1 take note, 2 careful, 3 dangerous */
  readonly level: 0 | 1 | 2 | 3;
}

export interface HourlyWeather {
  /** unix seconds */
  readonly time: readonly number[];
  readonly temperature: readonly number[];
  readonly precipitation: readonly number[];
  readonly snowfall: readonly number[];
  readonly code: readonly number[];
}

/** Port: hourly forecast for several places. */
export abstract class WeatherSource {
  abstract hourly(places: readonly Coordinate[]): Promise<(HourlyWeather | null)[]>;
}

const SNOW = [71, 73, 75, 77, 85, 86];
const FREEZING = [56, 57, 66, 67];

/** What a WMO weather code means for driving. */
export function drivingWeather(
  code: number,
  temperature: number,
  precipitation: number,
  snowfall: number,
): Pick<WeatherPoint, 'kind' | 'level'> {
  if (code >= 95) return { kind: 'storm', level: 3 };
  if (snowfall > 0 || SNOW.includes(code)) return { kind: 'snow', level: 2 };
  if (FREEZING.includes(code) || (temperature <= 1 && precipitation > 0)) {
    return { kind: 'ice', level: 2 };
  }
  if (precipitation >= 0.3 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return { kind: 'rain', level: 1 };
  }
  if (code === 45 || code === 48) return { kind: 'fog', level: 1 };
  if (temperature <= 1) return { kind: 'frost', level: 1 };
  return { kind: 'dry', level: 0 };
}

const SPACING_M = 15000;
const MAX_POINTS = 12;

/** Places along a route to ask the forecast for. */
export function weatherPlaces(line: Polyline): { alongM: number; at: Coordinate }[] {
  const count = Math.max(2, Math.min(MAX_POINTS, Math.ceil(line.lengthM / SPACING_M) + 1));
  return Array.from({ length: count }, (_, i) => {
    const alongM = (line.lengthM * i) / (count - 1);
    return { alongM, at: pointAt(line, alongM).point };
  });
}

/** The forecast for the hour the car gets there. */
export function weatherAt(
  forecast: HourlyWeather,
  alongM: number,
  arrivalMs: number,
): WeatherPoint | null {
  let best = -1;
  forecast.time.forEach((time, i) => {
    const off = Math.abs(time * 1000 - arrivalMs);
    if (best < 0 || off < Math.abs(forecast.time[best] * 1000 - arrivalMs)) best = i;
  });
  if (best < 0) return null;
  const temperature = forecast.temperature[best];
  const precipitationMm = forecast.precipitation[best] ?? 0;
  return {
    alongM,
    arrivalMs,
    temperature,
    precipitationMm,
    ...drivingWeather(
      forecast.code[best],
      temperature,
      precipitationMm,
      forecast.snowfall[best] ?? 0,
    ),
  };
}

export const WEATHER_ICONS: Readonly<Record<WeatherKind, string>> = {
  storm: 'cloud-storm',
  snow: 'snowflake',
  ice: 'snowflake',
  rain: 'cloud-rain',
  fog: 'mist',
  frost: 'temperature-minus',
  dry: 'sun',
};
