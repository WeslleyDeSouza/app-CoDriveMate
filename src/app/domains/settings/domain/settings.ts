import { METRIC, Units } from '@shared/kernel/units';

export type Theme = 'auto' | 'dark' | 'light';
export type FuelKind = 'petrol' | 'diesel';
export type RoutingProvider = 'auto' | 'google' | 'mapbox' | 'osm';
export type BaseMap = 'auto' | 'ofm' | 'mapbox' | 'mapboxnav' | 'google';
export type SceneWorld = 'real' | 'plain' | 'mapbox' | 'google';
export type SceneQuality = 'low' | 'normal' | 'high';
export type VoiceProvider = 'auto' | 'browser';

export interface AppSettings {
  theme: Theme;
  vehicle: {
    name: string;
    fuelType: FuelKind;
    displacementL: number;
    tankL: number | null;
    /** body colour of the 3D model, hex */
    color: string;
  };
  units: Units;
  /** price per litre in the local currency */
  fuelPrice: number;
  ecoTips: boolean;
  /** hints for level crossings, schools, danger signs (never speed cameras) */
  hazardHints: boolean;
  autoPark: boolean;
  /** drive on with guidance and recording while the screen is locked */
  background: boolean;
  voice: {
    navigation: boolean;
    readAnswers: boolean;
    /** 'auto' = cloud voice with the browser voice as fallback */
    provider: VoiceProvider;
    /** speaking rate, 1 = normal */
    rate: number;
    /** name of the Google voice */
    cloudVoice: string;
  };
  map: {
    routingProvider: RoutingProvider;
    baseMap: BaseMap;
    sceneWorld: SceneWorld;
    scene3d: boolean;
    /** what the 3D view shows; every part can be switched off */
    scene: {
      quality: SceneQuality;
      /** sharper aerial images near the car */
      sharpAerial: boolean;
      /** sky, sun position, haze, headlights at night */
      sky: boolean;
      shadows: boolean;
      /** swisstopo heights */
      terrain: boolean;
      /** swisstopo buildings with roofs */
      swissBuildings: boolean;
      swissTrees: boolean;
      /** windows, lit at night */
      facades: boolean;
      /** asphalt, edge lines, zebra crossings */
      roadDetails: boolean;
    };
    trafficLayer: boolean;
    swissTrafficReports: boolean;
    /** address of the user's own proxy for them */
    swissTrafficUrl: string;
  };
  ai: {
    model: string;
  };
  /**
   * API keys entered by the user. They live only on this device; nothing is
   * ever built into the app. Empty = service not used.
   */
  keys: {
    anthropic: string;
    openai: string;
    google: string;
    mapbox: string;
    tomtom: string;
  };
  /** Optional proxy that holds the keys server-side instead. */
  proxyUrl: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'auto',
  vehicle: {
    name: 'Citroën Xsara Picasso',
    fuelType: 'petrol',
    displacementL: 1.8,
    tankL: 55,
    color: '#2b2a45',
  },
  units: METRIC,
  fuelPrice: 1.85,
  ecoTips: true,
  hazardHints: true,
  autoPark: true,
  background: true,
  voice: { navigation: true, readAnswers: true, provider: 'auto', rate: 1.05, cloudVoice: 'Aoede' },
  map: {
    routingProvider: 'auto',
    baseMap: 'auto',
    sceneWorld: 'real',
    scene3d: true,
    scene: {
      quality: 'normal',
      sharpAerial: true,
      sky: true,
      shadows: true,
      terrain: true,
      swissBuildings: true,
      swissTrees: true,
      facades: true,
      roadDetails: true,
    },
    trafficLayer: true,
    swissTrafficReports: false,
    swissTrafficUrl: '',
  },
  ai: { model: 'claude-haiku-5-5' },
  keys: { anthropic: '', openai: '', google: '', mapbox: '', tomtom: '' },
  proxyUrl: '',
};

export type AiProvider = 'anthropic' | 'openai';

/** Who runs a model. */
export function aiProvider(model: string): AiProvider {
  return model.startsWith('gpt-') ? 'openai' : 'anthropic';
}

/** Whether the chosen model can be used; a proxy holds the Anthropic key itself. */
export function aiAvailable({ ai, keys, proxyUrl }: AppSettings): boolean {
  return aiProvider(ai.model) === 'openai' ? !!keys.openai : !!keys.anthropic || !!proxyUrl;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Returns `base` with `patch` applied, group by group. Unknown keys are ignored. */
export function mergeSettings<T extends object>(base: T, patch: DeepPartial<T> | undefined): T {
  if (!isPlainObject(patch)) return base;
  const result = { ...base } as Record<string, unknown>;
  for (const [key, current] of Object.entries(base)) {
    const next = (patch as Record<string, unknown>)[key];
    if (next === undefined) continue;
    result[key] = isPlainObject(current) ? mergeSettings(current, next as object) : next;
  }
  // Same reference when nothing changed, so callers can compare cheaply.
  const changed = Object.entries(base).some(([key, value]) => result[key] !== value);
  return changed ? (result as T) : base;
}

/** Port: where the settings are kept. */
export abstract class SettingsRepository {
  abstract load(): Promise<DeepPartial<AppSettings> | undefined>;
  abstract save(settings: AppSettings): Promise<void>;
}
