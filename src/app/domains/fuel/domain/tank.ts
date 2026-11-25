/** What is known about the tank and the usual consumption. */
export interface TankState {
  /** counted litres, null = unknown; the sensor of the car goes first */
  readonly litres: number | null;
  /** driven distance and fuel the average is taken from */
  readonly km: number;
  readonly usedL: number;
}

export const UNKNOWN_TANK: TankState = { litres: null, km: 0, usedL: 0 };

/** Used until enough was driven to know better. */
const USUAL_PER_100KM = 8;
const MIN_KM = 3;
const MEMORY_KM = 500;
export const LOW_RANGE_KM = 80;
/** The warning may come again after this much range. */
const ENOUGH_RANGE_KM = 150;

export function litresIn(
  state: TankState,
  sensorPercent: number | null,
  tankL: number | null,
): number | null {
  if (sensorPercent !== null && tankL !== null) return (sensorPercent / 100) * tankL;
  return state.litres;
}

export function averagePer100Km({ km, usedL }: TankState): number {
  if (km < MIN_KM || usedL <= 0) return USUAL_PER_100KM;
  return Math.min(25, Math.max(3, (usedL / km) * 100));
}

export function rangeKm(litres: number | null, per100Km: number): number | null {
  return litres === null ? null : Math.max(0, (litres / per100Km) * 100);
}

/** Counts a moment of driving. Older driving slowly loses weight. */
export function afterDriving(
  state: TankState,
  seconds: number,
  speedKmh: number,
  rateLph: number | null,
): TankState {
  if (rateLph === null) return state;
  const usedL = (rateLph * seconds) / 3600;
  const next = {
    litres: state.litres === null ? null : Math.max(0, state.litres - usedL),
    km: state.km + (speedKmh * seconds) / 3600,
    usedL: state.usedL + usedL,
  };
  return next.km > MEMORY_KM ? { ...next, km: next.km / 2, usedL: next.usedL / 2 } : next;
}

/** Warns once when the range gets short. */
export class LowFuelWarning {
  private warned = false;

  next(range: number | null): boolean {
    if (range === null) return false;
    if (range > ENOUGH_RANGE_KM) this.warned = false;
    if (range >= LOW_RANGE_KM || this.warned) return false;
    return (this.warned = true);
  }
}

/** Port: where the tank state is kept. */
export abstract class TankRepository {
  abstract load(): Promise<TankState | undefined>;
  abstract save(state: TankState): Promise<void>;
}
