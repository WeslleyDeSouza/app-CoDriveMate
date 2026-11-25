/** Live values of the vehicle. `null` means: not (yet) delivered by the car. */
export interface TelemetrySnapshot {
  /** km/h */
  speed: number;
  /** 1/min */
  rpm: number;
  /** throttle position, % */
  throttle: number | null;
  /** calculated engine load, % */
  load: number | null;
  /** intake manifold absolute pressure, kPa */
  manifoldPressure: number | null;
  /** mass air flow, g/s */
  massAirFlow: number | null;
  /** °C */
  coolantTemp: number | null;
  /** °C */
  intakeTemp: number | null;
  /** timing advance, ° before TDC */
  timingAdvance: number | null;
  /** short term fuel trim, % */
  shortFuelTrim: number | null;
  /** long term fuel trim, % */
  longFuelTrim: number | null;
  /** oxygen sensor voltage, V */
  oxygenVoltage: number | null;
  /** battery voltage, V */
  voltage: number | null;
  /** fuel tank level, % */
  fuelLevel: number | null;
}

export type TelemetryKey = keyof TelemetrySnapshot;

export function emptySnapshot(): TelemetrySnapshot {
  return {
    speed: 0,
    rpm: 0,
    throttle: null,
    load: null,
    manifoldPressure: null,
    massAirFlow: null,
    coolantTemp: null,
    intakeTemp: null,
    timingAdvance: null,
    shortFuelTrim: null,
    longFuelTrim: null,
    oxygenVoltage: null,
    voltage: null,
    fuelLevel: null,
  };
}

export type TelemetryMode = 'off' | 'connecting' | 'obd' | 'demo';

export interface TelemetryUpdate {
  readonly values: Partial<TelemetrySnapshot>;
  /** Full polling cycles per second, when the source knows it. */
  readonly rateHz?: number;
}

/**
 * Port: anything that delivers live vehicle data (OBD adapter, demo drive,
 * later e.g. a recorded trip).
 */
export abstract class TelemetrySource {
  /** Resolves once data flows. `onEnd` fires when the source stops on its own. */
  abstract start(onUpdate: (update: TelemetryUpdate) => void, onEnd: () => void): Promise<void>;
  abstract stop(): Promise<void>;
  /** Sends a single OBD request and resolves with the raw answer. */
  abstract request(command: string, timeoutMs: number): Promise<string>;
}

/**
 * What may be asked besides live data: status, stored and pending fault codes,
 * and clearing them. Nothing else is ever sent to a control unit.
 */
const ALLOWED_REQUESTS = ['0101', '03', '07', '04'];

export function isAllowedRequest(command: string): boolean {
  return ALLOWED_REQUESTS.includes(command);
}
