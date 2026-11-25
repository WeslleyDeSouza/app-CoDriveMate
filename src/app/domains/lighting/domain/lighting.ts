/** Byte protocol and rules of the ESP32 light module, as in the prototype. */
export const ZONES = ['front_floor', 'rear_floor', 'dashboard', 'boot'] as const;
export type ZoneName = (typeof ZONES)[number];
export const EFFECTS = ['still', 'breathe', 'party', 'welcome'] as const;

export interface LightZone {
  readonly on: boolean;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** 0-255 */
  readonly brightness: number;
  /** index of EFFECTS */
  readonly effect: number;
  readonly speed: number;
}

export interface LightState {
  readonly zones: readonly LightZone[];
  /** zones the controls act on */
  readonly selected: readonly number[];
  /** brightness while driving, 0-255 */
  readonly driveBrightness: number;
}

const WARM: LightZone = { on: true, r: 255, g: 147, b: 41, brightness: 110, effect: 0, speed: 60 };
export const DEFAULT_LIGHT: LightState = {
  zones: ZONES.map(() => WARM),
  selected: [0, 1, 2, 3],
  driveBrightness: 77,
};

export const COLORS: readonly string[] = [
  '#ff9329',
  '#fff1dc',
  '#ffb000',
  '#ff5a0a',
  '#00b4aa',
  '#6a5cff',
  '#ff2d6f',
  '#22c55e',
];

export interface LightScene {
  readonly name: string;
  readonly icon: string;
  readonly background: string;
  readonly zones: readonly number[];
  /** null = everything off */
  readonly set: Partial<LightZone> | null;
}

export const SCENES: readonly LightScene[] = [
  {
    name: 'warm',
    icon: 'sun',
    background: '#c9761f',
    zones: [0, 1, 2, 3],
    set: { r: 255, g: 147, b: 41, brightness: 120, effect: 0 },
  },
  {
    name: 'lounge',
    icon: 'armchair',
    background: '#5b4fd6',
    zones: [0, 1, 2],
    set: { r: 106, g: 92, b: 255, brightness: 70, effect: 1 },
  },
  {
    name: 'night',
    icon: 'moon',
    background: '#7a3a14',
    zones: [0, 1],
    set: { r: 255, g: 90, b: 10, brightness: 22, effect: 0 },
  },
  {
    name: 'petrol',
    icon: 'droplet',
    background: '#0d8f87',
    zones: [0, 1, 2],
    set: { r: 0, g: 180, b: 170, brightness: 100, effect: 0 },
  },
  {
    name: 'welcome',
    icon: 'hand-stop',
    background: '#b8742e',
    zones: [0, 1, 2, 3],
    set: { r: 255, g: 160, b: 60, brightness: 140, effect: 3 },
  },
  {
    name: 'party',
    icon: 'confetti',
    background: 'linear-gradient(120deg,#ff4d6a,#ffb000,#22c55e,#4c8dff,#a855f7)',
    zones: [0, 1, 2, 3],
    set: { r: 255, g: 255, b: 255, brightness: 150, effect: 2 },
  },
  { name: 'off', icon: 'power', background: '#3a3f49', zones: [0, 1, 2, 3], set: null },
];

export function hexOf({ r, g, b }: LightZone): string {
  return '#' + [r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function colorFromHex(hex: string): Pick<LightZone, 'r' | 'g' | 'b'> {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) || 0);
  return { r, g, b };
}

/** Changes the zones in `which`. */
export function withChange(
  state: LightState,
  which: readonly number[],
  change: Partial<LightZone>,
): LightState {
  return {
    ...state,
    zones: state.zones.map((zone, i) => (which.includes(i) ? { ...zone, ...change } : zone)),
  };
}

export function withScene(state: LightState, { zones, set }: LightScene): LightState {
  return {
    ...state,
    zones: state.zones.map((zone, i) =>
      set && zones.includes(i) ? { ...zone, ...set, on: true } : { ...zone, on: false },
    ),
  };
}

/** Selects or leaves a zone; at least one stays selected. */
export function withSelection(state: LightState, zone: number): LightState {
  const selected = state.selected.includes(zone)
    ? state.selected.filter((other) => other !== zone)
    : [...state.selected, zone].sort();
  return { ...state, selected: selected.length ? selected : [zone] };
}

/** Commands that bring the module to a state; equal zones share one. */
export function zoneCommands(zones: readonly LightZone[], which: readonly number[]): Uint8Array[] {
  const groups = new Map<string, number>();
  for (const i of which) {
    const key = JSON.stringify(zones[i]);
    groups.set(key, (groups.get(key) ?? 0) | (1 << i));
  }
  return [...groups].map(([key, mask]) => {
    const z = JSON.parse(key) as LightZone;
    return Uint8Array.of(1, mask, z.on ? 1 : 0, z.r, z.g, z.b, z.brightness, z.effect, z.speed);
  });
}

const DRIVING_KMH = 5;

export function isDriving(speedKmh: number): boolean {
  return speedKmh > DRIVING_KMH;
}

/** Dims while driving, full brightness while standing. */
export function driveCommand(driving: boolean, driveBrightness: number): Uint8Array {
  return Uint8Array.of(2, driving ? driveBrightness : 255, driving ? 1 : 0);
}

export const OFF_COMMAND = Uint8Array.of(3);
/** Keeps the present state as the one after switching on. */
export const STORE_COMMAND = Uint8Array.of(4);

export interface ModuleState {
  readonly zones: number;
  readonly voltage: number | null;
}

export function parseModuleState(data: Uint8Array): ModuleState | null {
  if (data.length < 4) return null;
  return { zones: data[0], voltage: data[3] ? data[3] / 10 : null };
}

/** Light of the prototype (localStorage `pd_light`). */
export interface LegacyLight {
  z?: {
    on?: number;
    r?: number;
    g?: number;
    b?: number;
    bri?: number;
    fx?: number;
    spd?: number;
  }[];
  sel?: number[];
  drv?: number;
}

export function lightFromLegacy({ z, sel, drv }: LegacyLight): LightState {
  const byte = (value: number | undefined, fallback: number) =>
    Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value as number))) : fallback;
  return {
    zones: ZONES.map((_, i) => ({
      on: (z?.[i]?.on ?? 1) !== 0,
      r: byte(z?.[i]?.r, WARM.r),
      g: byte(z?.[i]?.g, WARM.g),
      b: byte(z?.[i]?.b, WARM.b),
      brightness: byte(z?.[i]?.bri, WARM.brightness),
      effect: Math.min(EFFECTS.length - 1, byte(z?.[i]?.fx, 0)),
      speed: byte(z?.[i]?.spd, WARM.speed),
    })),
    selected: sel?.length ? sel.filter((i) => i >= 0 && i < ZONES.length) : DEFAULT_LIGHT.selected,
    driveBrightness: byte(drv, DEFAULT_LIGHT.driveBrightness),
  };
}

/** How the module is looked for: by its service, or by the name of older firmware. */
export type LightSearch = 'service' | 'currus' | 'picasso';

export interface LightDevice {
  readonly id: string;
  readonly name: string;
}

export interface LightConnection {
  send(command: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/** Port: the light module. */
export abstract class LightModule {
  abstract choose(search: LightSearch): Promise<LightDevice>;
  abstract open(
    device: LightDevice,
    onState: (data: Uint8Array) => void,
    onClose: () => void,
  ): Promise<LightConnection>;
}

/** Port: what is remembered. */
export abstract class LightRepository {
  abstract load(): Promise<LightState | undefined>;
  abstract save(state: LightState): Promise<void>;
  abstract loadDevice(): Promise<LightDevice | undefined>;
  abstract saveDevice(device: LightDevice): Promise<void>;
}
