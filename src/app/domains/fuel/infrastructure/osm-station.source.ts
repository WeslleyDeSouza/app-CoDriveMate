import { Injectable, inject } from '@angular/core';
import { HttpPort } from '@core/http';
import { CacheStore } from '@core/storage';
import { LonLat, Station, StationSource } from '../domain/stations';

const BUCKET = 'fuel';
const FRESH_MS = 7 * 86_400_000;
const MAX_ENTRIES = 200;
const OVERPASS = 'https://overpass-api.de/api/interpreter';

/** Photon answers fast, Overpass knows the opening hours. Both are OpenStreetMap. */
@Injectable()
export class OsmStationSource extends StationSource {
  private readonly http = inject(HttpPort);
  private readonly cache = inject(CacheStore);

  async around(points: readonly LonLat[], radiusM: number): Promise<Station[]> {
    const answers = await Promise.all(points.map((point) => this.photon(point, radiusM)));
    const found = answers.filter((answer) => answer !== null);
    if (!found.length) throw new Error('No filling stations available.');
    return [...new Map(found.flat().map((station) => [station.id, station])).values()];
  }

  async detailed(points: readonly LonLat[], radiusM: number): Promise<Station[] | null> {
    const line = points.map(([lon, lat]) => `${lat.toFixed(3)},${lon.toFixed(3)}`).join(',');
    const query = `[out:json][timeout:10];nwr(around:${radiusM},${line})[amenity=fuel];out tags center 80;`;
    return this.cached('o/' + radiusM + '/' + line, async () => {
      const { ok, body } = await this.http.getJson(
        OVERPASS + '?data=' + encodeURIComponent(query),
        12000,
      );
      const elements = (body as { elements?: OverpassElement[] } | null)?.elements;
      return ok && Array.isArray(elements) ? elements.flatMap(fromOverpass) : null;
    });
  }

  private photon([lon, lat]: LonLat, radiusM: number): Promise<Station[] | null> {
    // About 1 km: near places share the stored answer.
    const at = `lon=${lon.toFixed(2)}&lat=${lat.toFixed(2)}`;
    const km = Math.ceil(radiusM / 1000) + 1;
    return this.cached('p/' + at + km, async () => {
      const { ok, body } = await this.http.getJson(
        `https://photon.komoot.io/reverse?${at}&radius=${km}&limit=30&osm_tag=amenity:fuel`,
      );
      const features = (body as { features?: PhotonFeature[] } | null)?.features;
      return ok && Array.isArray(features) ? features.map(fromPhoton) : null;
    });
  }

  /** Stored answers serve offline, also when they are old. */
  private async cached(
    key: string,
    load: () => Promise<Station[] | null>,
  ): Promise<Station[] | null> {
    const stored = await this.cache
      .get<{ at: number; stations: Station[] }>(BUCKET, key)
      .catch(() => undefined);
    if (stored && Date.now() - stored.at < FRESH_MS) return stored.stations;
    const stations = await load().catch(() => null);
    if (!stations) return stored?.stations ?? null;
    await this.cache.put(BUCKET, key, { at: Date.now(), stations }).catch(() => undefined);
    if (Math.random() < 0.1) void this.cache.prune(BUCKET, MAX_ENTRIES).catch(() => 0);
    return stations;
  }
}

interface PhotonFeature {
  readonly geometry: { readonly coordinates: [number, number] };
  readonly properties: Record<string, string | number | undefined>;
}

function fromPhoton({ geometry, properties: p }: PhotonFeature): Station {
  const street = [p['street'], p['housenumber']].filter(Boolean).join(' ');
  return {
    id: `${p['osm_type']}${p['osm_id']}`,
    name: String(p['name'] ?? ''),
    address: [street, p['city']].filter(Boolean).join(', '),
    at: geometry.coordinates,
    openingHours: '',
    lacks: [],
  };
}

interface OverpassElement {
  readonly type: string;
  readonly id: number;
  readonly lat?: number;
  readonly lon?: number;
  readonly center?: { readonly lat: number; readonly lon: number };
  readonly tags?: Record<string, string>;
}

function fromOverpass({ type, id, lat, lon, center, tags = {} }: OverpassElement): Station[] {
  const at: [number | undefined, number | undefined] = [lon ?? center?.lon, lat ?? center?.lat];
  if (at[0] === undefined || at[1] === undefined) return [];
  // Company pumps are no help.
  if (/^(private|no|customers)$/.test(tags['access'] ?? '')) return [];
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  return [
    {
      id: type.charAt(0).toUpperCase() + id,
      name: tags['name'] || tags['brand'] || tags['operator'] || '',
      address: [street, tags['addr:city']].filter(Boolean).join(', '),
      at: [at[0], at[1]],
      openingHours: tags['opening_hours'] ?? '',
      lacks: [
        ...(tags['fuel:octane_95'] === 'no' ? (['petrol'] as const) : []),
        ...(tags['fuel:diesel'] === 'no' ? (['diesel'] as const) : []),
      ],
    },
  ];
}
