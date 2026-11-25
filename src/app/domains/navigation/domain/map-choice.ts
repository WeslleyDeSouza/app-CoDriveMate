export type MapKind = 'mapbox' | 'mapboxnav' | 'google' | 'ofm';

export interface MapPreference {
  readonly baseMap: 'auto' | 'ofm' | 'mapbox' | 'mapboxnav' | 'google';
  readonly routingProvider: 'auto' | 'google' | 'mapbox' | 'osm';
}

/** Whose routes belong on a map. */
export function providerOf(kind: MapKind): 'mapbox' | 'google' | 'osm' {
  return kind === 'ofm' ? 'osm' : kind === 'google' ? 'google' : 'mapbox';
}

/**
 * Which map to show. Map and route always come from the same provider: the
 * map decides, the route follows. Google only if the user asks for it.
 */
export function chooseMap(
  preference: MapPreference,
  mapboxUsable: boolean,
  googleUsable = false,
): MapKind {
  const { baseMap, routingProvider } = preference;
  const wantsGoogle = baseMap === 'google' || (baseMap === 'auto' && routingProvider === 'google');
  if (wantsGoogle && googleUsable) return 'google';
  if (!mapboxUsable || preference.baseMap === 'ofm') return 'ofm';
  if (preference.baseMap === 'mapbox' || preference.baseMap === 'mapboxnav') {
    return preference.baseMap;
  }
  return preference.routingProvider === 'osm' ? 'ofm' : 'mapbox';
}
