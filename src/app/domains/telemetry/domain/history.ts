import { TelemetrySnapshot } from './telemetry';

export type SeriesKey = 'speed' | 'rpm' | 'coolantTemp' | 'consumption' | 'throttle' | 'voltage';

export interface Series {
  readonly key: SeriesKey;
  readonly min: number;
  readonly max: number;
  readonly color: string;
  readonly digits: number;
}

export const SERIES: readonly Series[] = [
  { key: 'speed', min: 0, max: 200, color: '#5b9bff', digits: 0 },
  { key: 'rpm', min: 0, max: 7000, color: '#a78bfa', digits: 0 },
  { key: 'coolantTemp', min: 0, max: 120, color: '#2fc17a', digits: 0 },
  { key: 'consumption', min: 0, max: 20, color: '#f2a93b', digits: 1 },
  { key: 'throttle', min: 0, max: 100, color: '#ff5a5f', digits: 0 },
  { key: 'voltage', min: 11, max: 15.5, color: '#3ad1bd', digits: 1 },
];

export type Sample = Readonly<Record<SeriesKey, number | null>>;
export const HISTORY_STEP_MS = 600;
/** Two minutes. */
export const HISTORY_LENGTH = 200;

export function sampleOf(values: TelemetrySnapshot, rateLph: number | null): Sample {
  const { speed, rpm, coolantTemp, throttle, voltage } = values;
  return { speed, rpm, coolantTemp, throttle, voltage, consumption: rateLph };
}

export function withSample(history: readonly Sample[], sample: Sample): Sample[] {
  return [...history.slice(-(HISTORY_LENGTH - 1)), sample];
}

/** Line pieces (SVG path data) of a series; gaps where the car delivers nothing. */
export function pathOf(
  history: readonly Sample[],
  { key, min, max }: Series,
  width: number,
  height: number,
): string {
  let drawing = false;
  let path = '';
  history.forEach((sample, i) => {
    const value = sample[key];
    if (value === null) {
      drawing = false;
      return;
    }
    const x = (width * (i + HISTORY_LENGTH - history.length)) / (HISTORY_LENGTH - 1);
    const share = Math.max(0, Math.min(1, (value - min) / (max - min)));
    path += `${drawing ? 'L' : 'M'}${x.toFixed(1)} ${(height * (1 - share)).toFixed(1)}`;
    drawing = true;
  });
  return path;
}
