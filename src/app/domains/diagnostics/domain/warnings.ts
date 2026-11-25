export type WarningId =
  'coolant_hot' | 'coolant_warm' | 'charge_high' | 'charge_low' | 'range' | 'lamp';
export type WarningLevel = 'warn' | 'crit';
export type WarningTile = 'coolant' | 'battery' | 'range';

export interface VehicleWarning {
  readonly id: WarningId;
  readonly level: WarningLevel;
  readonly tile: WarningTile | null;
  readonly icon: string;
  readonly value: string;
  /** shown in the tile only, no card and no voice */
  readonly quiet: boolean;
  /** area that helps */
  readonly route: string | null;
}

export interface VehicleState {
  readonly connected: boolean;
  readonly rpm: number;
  readonly coolantC: number | null;
  readonly voltage: number | null;
  readonly rangeKm: number | null;
  readonly lamp: boolean | null;
  readonly codes: readonly string[];
}

const ENGINE_RUNS_RPM = 500;

/** Everything that is wrong with the car right now. */
export function vehicleWarnings(car: VehicleState): VehicleWarning[] {
  if (!car.connected) return [];
  const { coolantC, voltage, rangeKm } = car;
  const list: VehicleWarning[] = [];
  const add = (
    id: WarningId,
    level: WarningLevel,
    tile: WarningTile | null,
    icon: string,
    value: string,
    more: Partial<VehicleWarning> = {},
  ) => list.push({ id, level, tile, icon, value, quiet: false, route: null, ...more });

  if (coolantC !== null && coolantC >= 105) {
    add('coolant_hot', 'crit', 'coolant', 'temperature', Math.round(coolantC) + ' °C');
  } else if (coolantC !== null && coolantC >= 100) {
    add('coolant_warm', 'warn', 'coolant', 'temperature', Math.round(coolantC) + ' °C', {
      quiet: true,
    });
  }
  if (voltage !== null && voltage > 15.2) {
    add('charge_high', 'crit', 'battery', 'battery-automotive', voltage.toFixed(1) + ' V');
  } else if (voltage !== null && car.rpm > ENGINE_RUNS_RPM && voltage < 12.8) {
    add('charge_low', 'warn', 'battery', 'battery-automotive', voltage.toFixed(1) + ' V');
  }
  if (rangeKm !== null && rangeKm < 30) {
    add(
      'range',
      rangeKm < 10 ? 'crit' : 'warn',
      'range',
      'gas-station',
      Math.round(rangeKm) + ' km',
      { route: '/fuel' },
    );
  }
  if (car.lamp) {
    add('lamp', 'warn', null, 'engine', car.codes.slice(0, 3).join(', '), {
      route: '/diagnostics',
    });
  }
  return list;
}

/** A condition must last, so that a single odd reading is no alarm. */
const MIN_DURATION_MS = 3000;
/** A critical one comes back, even when it was confirmed. */
const REPEAT_MS = 600_000;

export interface WarningState {
  readonly active: readonly VehicleWarning[];
  /** the one that needs attention */
  readonly shown: VehicleWarning | null;
}

export class WarningMonitor {
  private readonly since = new Map<WarningId, number>();
  private readonly confirmed = new Map<WarningId, number>();

  next(warnings: readonly VehicleWarning[], now: number): WarningState {
    const present = new Set(warnings.map(({ id }) => id));
    for (const id of [...this.since.keys()]) {
      if (present.has(id)) continue;
      this.since.delete(id);
      this.confirmed.delete(id);
    }
    const active = warnings.filter(({ id }) => {
      if (!this.since.has(id)) this.since.set(id, now);
      return now - (this.since.get(id) ?? now) >= MIN_DURATION_MS;
    });
    const open = active.filter(({ id, level, quiet }) => {
      const confirmedAt = this.confirmed.get(id);
      if (quiet) return false;
      return confirmedAt === undefined || (level === 'crit' && now - confirmedAt > REPEAT_MS);
    });
    const shown = open.find(({ level }) => level === 'crit') ?? open[0] ?? null;
    return { active, shown };
  }

  confirm(id: WarningId, now: number): void {
    this.confirmed.set(id, now);
  }
}
