import { AppSettings, DEFAULT_SETTINGS, DeepPartial, mergeSettings } from './settings';

/**
 * Settings object of the prototype (localStorage `pdrive2`). Flags were
 * stored as the strings '1' and '0'.
 */
export interface LegacyConfig {
  key?: string;
  tkey?: string;
  gkey?: string;
  mbkey?: string;
  astra?: string;
  world?: string;
  scene3d?: string;
  prov?: string;
  base?: string;
  gtraffic?: string;
  model?: string;
  disp?: number | string;
  price?: number | string;
  tts?: string;
  voice?: string;
  theme?: string;
  color?: string;
  vname?: string;
  ftype?: string;
  eco?: string;
  haz?: string;
  autopark?: string;
  ttsp?: string;
  ttsr?: number | string;
}

const flag = (value: string | undefined): boolean | undefined =>
  value === undefined ? undefined : value !== '0';

const number = (value: number | string | null | undefined): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const oneOf = <T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined => (allowed.includes(value as T) ? (value as T) : undefined);

/** Maps the prototype's settings onto the current model; anything missing keeps its default. */
export function settingsFromLegacy(
  legacy: LegacyConfig,
  tankSizeL?: number | string | null,
): AppSettings {
  const patch: DeepPartial<AppSettings> = {
    theme: oneOf(legacy.theme, ['auto', 'dark', 'light']),
    vehicle: {
      name: legacy.vname || undefined,
      fuelType: oneOf(legacy.ftype, ['petrol', 'diesel']),
      displacementL: number(legacy.disp),
      tankL: number(tankSizeL),
      color: legacy.color || undefined,
    },
    fuelPrice: number(legacy.price),
    ecoTips: flag(legacy.eco),
    hazardHints: flag(legacy.haz),
    autoPark: flag(legacy.autopark),
    voice: {
      navigation: flag(legacy.voice),
      readAnswers: flag(legacy.tts),
      provider: oneOf(legacy.ttsp, ['auto', 'browser']),
      rate: number(legacy.ttsr),
    },
    map: {
      routingProvider: oneOf(legacy.prov, ['auto', 'google', 'mapbox', 'osm']),
      baseMap: oneOf(legacy.base, ['auto', 'ofm', 'mapbox', 'mapboxnav', 'google']),
      sceneWorld: oneOf(legacy.world, ['real', 'plain', 'mapbox', 'google']),
      scene3d: flag(legacy.scene3d),
      trafficLayer: flag(legacy.gtraffic),
      swissTrafficReports: flag(legacy.astra),
    },
    ai: { model: legacy.model || undefined },
    keys: {
      anthropic: legacy.key || undefined,
      google: legacy.gkey || undefined,
      mapbox: legacy.mbkey || undefined,
      tomtom: legacy.tkey || undefined,
    },
  };
  return mergeSettings(DEFAULT_SETTINGS, patch);
}
