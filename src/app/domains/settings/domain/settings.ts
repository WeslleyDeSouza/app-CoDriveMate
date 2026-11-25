import { METRIC, Units } from '@shared/kernel/units';

export type Theme = 'auto' | 'dark' | 'light';
export type FuelKind = 'petrol' | 'diesel';
export type RoutingProvider = 'auto' | 'google' | 'mapbox' | 'osm';
export type BaseMap = 'auto' | 'ofm' | 'mapbox' | 'mapboxnav' | 'google';
export type SceneWorld = 'real' | 'plain' | 'mapbox' | 'google';
export type SceneQuality = 'low' | 'normal' | 'high';
export type VoiceProvider = 'auto' | 'browser' | 'openai' | 'elevenlabs';

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
    /** vehicle warnings and an almost empty tank are spoken; they are always shown */
    warnings: boolean;
    /** hazards, traffic, weather and parking reminders are spoken */
    infos: boolean;
    /** the conversation modes may speak */
    conversation: boolean;
    /** 'auto' = Google voice; every cloud voice falls back to the device voice */
    provider: VoiceProvider;
    /** speaking rate, 1 = normal */
    rate: number;
    /** name of the Google voice */
    cloudVoice: string;
    openaiVoice: string;
    /** chosen voice of the ElevenLabs account, '' = none */
    elevenVoice: { id: string; name: string };
  };
  map: {
    routingProvider: RoutingProvider;
    baseMap: BaseMap;
    sceneWorld: SceneWorld;
    scene3d: boolean;
    /** round speedometer, instead of the 3D view or with it on large screens */
    gauge: boolean;
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
    /** conversation: only told, or with questions and answers */
    talkStyle: 'monologue' | 'dialogue';
    /** how often the conversation says something */
    talkPace: 'little' | 'medium' | 'much';
    /** the conversation remembers things about the driver */
    memory: boolean;
  };
  /**
   * API keys entered by the user. They live only on this device; nothing is
   * ever built into the app. Empty = service not used.
   */
  keys: {
    anthropic: string;
    openai: string;
    elevenlabs: string;
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
  voice: {
    navigation: true,
    readAnswers: true,
    warnings: true,
    infos: true,
    conversation: true,
    provider: 'auto',
    rate: 1.05,
    cloudVoice: 'Aoede',
    openaiVoice: 'marin',
    elevenVoice: { id: '', name: '' },
  },
  map: {
    routingProvider: 'auto',
    baseMap: 'auto',
    sceneWorld: 'real',
    scene3d: true,
    gauge: false,
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
  ai: { model: 'claude-haiku-5-5', talkStyle: 'dialogue', talkPace: 'medium', memory: true },
  keys: { anthropic: '', openai: '', elevenlabs: '', google: '', mapbox: '', tomtom: '' },
  proxyUrl: '',
};

/** The natural voice to use; without a key the device speaks. */
export function cloudVoice({ voice, keys }: Pick<AppSettings, 'voice' | 'keys'>): {
  provider: 'google' | 'openai' | 'elevenlabs';
  key: string;
  voice: string;
} {
  switch (voice.provider) {
    case 'openai':
      return { provider: 'openai', key: keys.openai, voice: voice.openaiVoice };
    case 'elevenlabs':
      return { provider: 'elevenlabs', key: keys.elevenlabs, voice: voice.elevenVoice.id };
    case 'browser':
      return { provider: 'google', key: '', voice: voice.cloudVoice };
    default:
      return { provider: 'google', key: keys.google, voice: voice.cloudVoice };
  }
}

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
