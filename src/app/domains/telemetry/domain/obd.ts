import { TelemetryKey } from './telemetry';

/** OBD2 mode 01 parameter: PID, number of data bytes and how to decode them. */
export interface ObdPid {
  readonly code: string;
  readonly bytes: number;
  decode(data: readonly number[]): number;
}

/** Values read through a PID. Battery voltage comes from the adapter (ATRV) instead. */
export type PidKey = Exclude<TelemetryKey, 'voltage'>;

export const OBD_PIDS: Readonly<Record<PidKey, ObdPid>> = {
  speed: { code: '0D', bytes: 1, decode: (b) => b[0] },
  rpm: { code: '0C', bytes: 2, decode: (b) => (b[0] * 256 + b[1]) / 4 },
  throttle: { code: '11', bytes: 1, decode: (b) => (b[0] * 100) / 255 },
  load: { code: '04', bytes: 1, decode: (b) => (b[0] * 100) / 255 },
  manifoldPressure: { code: '0B', bytes: 1, decode: (b) => b[0] },
  massAirFlow: { code: '10', bytes: 2, decode: (b) => (b[0] * 256 + b[1]) / 100 },
  coolantTemp: { code: '05', bytes: 1, decode: (b) => b[0] - 40 },
  intakeTemp: { code: '0F', bytes: 1, decode: (b) => b[0] - 40 },
  timingAdvance: { code: '0E', bytes: 1, decode: (b) => b[0] / 2 - 64 },
  shortFuelTrim: { code: '06', bytes: 1, decode: (b) => ((b[0] - 128) * 100) / 128 },
  longFuelTrim: { code: '07', bytes: 1, decode: (b) => ((b[0] - 128) * 100) / 128 },
  oxygenVoltage: { code: '14', bytes: 1, decode: (b) => b[0] / 200 },
  fuelLevel: { code: '2F', bytes: 1, decode: (b) => (b[0] * 100) / 255 },
};

/** Polled every cycle. */
export const FAST_KEYS: readonly PidKey[] = [
  'speed',
  'rpm',
  'throttle',
  'load',
  'manifoldPressure',
  'massAirFlow',
];

/** One of these per cycle, in rotation. */
export const SLOW_KEYS: readonly TelemetryKey[] = [
  'coolantTemp',
  'intakeTemp',
  'voltage',
  'timingAdvance',
  'shortFuelTrim',
  'longFuelTrim',
  'oxygenVoltage',
  'fuelLevel',
];

/** Splits a raw ELM327 answer into upper-case lines without whitespace. */
export function responseLines(raw: string): string[] {
  return raw
    .split(/[\r\n]+/)
    .map((line) => line.replace(/\s/g, '').toUpperCase())
    .filter(Boolean);
}

/**
 * Bitmask of supported PIDs 01-20 from the answer to `0100`, as a string of
 * 32 '0'/'1' characters (index 0 = PID 01). Null if the ECU did not answer.
 */
export function parseSupportedPids(raw: string): string | null {
  const line = responseLines(raw).find((l) => l.startsWith('4100') && l.length >= 12);
  if (!line) return null;
  return (line.slice(4, 12).match(/../g) ?? [])
    .map((hex) => parseInt(hex, 16).toString(2).padStart(8, '0'))
    .join('');
}

/**
 * The 0100 mask only covers PIDs 01-20. Higher PIDs (e.g. fuel level 2F) are
 * unknown from it, so they count as supported and are probed.
 */
export function isPidSupported(pid: ObdPid, supportedMask: string | null): boolean {
  const number = parseInt(pid.code, 16);
  return !supportedMask || number > 32 || supportedMask[number - 1] === '1';
}

/** Decodes the answer to a mode 01 request. Null if the answer is missing or short. */
export function decodePidResponse(pid: ObdPid, raw: string): number | null {
  const prefix = '41' + pid.code;
  const line = responseLines(raw).find((l) => l.startsWith(prefix));
  if (!line || line.length < prefix.length + pid.bytes * 2) return null;
  const data = (line.slice(prefix.length).match(/../g) ?? []).map((hex) => parseInt(hex, 16));
  return pid.decode(data);
}

/** Battery voltage from the adapter's `ATRV` answer, e.g. "12.4V". */
export function parseAdapterVoltage(raw: string): number | null {
  const value = parseFloat(raw);
  return Number.isNaN(value) ? null : value;
}
