import { Injectable, inject } from '@angular/core';
import { HttpPort, HttpResult } from '@core/http';
import { SettingsStore } from '@domains/settings';
import { QuotaExhaustedError } from '@shared/kernel/provider-chain';
import { Coordinate } from '../domain/geo';
import { NavigationService } from '../domain/ports';
import { KeyRejectedError, NoRouteError, Place, Route } from '../domain/route';
import { routeFromOsrm } from './osrm-format';

const pair = (c: Coordinate) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`;

/** Mapbox Directions with live traffic and Mapbox Geocoding. Results are never stored. */
@Injectable()
export class MapboxNavigationService extends NavigationService {
  readonly id = 'mapbox' as const;
  private readonly http = inject(HttpPort);
  private readonly settings = inject(SettingsStore).settings;

  async route(from: Coordinate, to: Coordinate): Promise<Route> {
    const result = await this.http.getJson(
      `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${pair(from)};${pair(to)}` +
        `?geometries=geojson&overview=full&steps=true&annotations=congestion&${this.token()}`,
    );
    this.check(result);
    return routeFromOsrm(result.body, 'mapbox');
  }

  async search(text: string, near: Coordinate | null, lang: string): Promise<Place[]> {
    const proximity = near ? `&proximity=${pair(near)}` : '';
    const result = await this.http.getJson(
      `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(text)}` +
        `&limit=5&language=${lang}${proximity}&${this.token()}`,
    );
    this.check(result);
    const features =
      (
        result.body as {
          features?: {
            geometry: { coordinates: [number, number] };
            properties: { name?: string; place_formatted?: string };
          }[];
        } | null
      )?.features ?? [];
    return features.map(({ geometry, properties }) => ({
      name: properties.name ?? text,
      detail: properties.place_formatted ?? '',
      coordinate: geometry.coordinates,
      source: this.id,
    }));
  }

  /** Mapbox completes what is being typed by itself. */
  suggest(text: string, near: Coordinate | null, lang: string): Promise<Place[]> {
    return this.search(text, near, lang);
  }

  private token(): string {
    return 'access_token=' + encodeURIComponent(this.settings().keys.mapbox);
  }

  private check({ status, ok, body }: HttpResult): void {
    const text = JSON.stringify(body ?? '').toLowerCase();
    if (status === 429 || status === 402) throw new QuotaExhaustedError('mapbox');
    if (status === 403 && /quota|billing|exhaust|limit/.test(text)) {
      throw new QuotaExhaustedError('mapbox');
    }
    if (status === 401 || status === 403) throw new KeyRejectedError('mapbox');
    if (!ok) throw new NoRouteError();
  }
}

const PHOTON_LANGUAGES = ['de', 'en', 'fr'];

/** OSRM routes, Nominatim search and Photon suggestions, free and without a key. */
@Injectable()
export class OsmNavigationService extends NavigationService {
  readonly id = 'osm' as const;
  private readonly http = inject(HttpPort);

  async route(from: Coordinate, to: Coordinate): Promise<Route> {
    const result = await this.http.getJson(
      `https://router.project-osrm.org/route/v1/driving/${pair(from)};${pair(to)}` +
        '?overview=full&geometries=geojson&steps=true',
    );
    if (!result.ok) throw new NoRouteError();
    return routeFromOsrm(result.body, 'osm');
  }

  async search(text: string, near: Coordinate | null, lang: string): Promise<Place[]> {
    const box = near
      ? `&viewbox=${near[0] - 1},${near[1] + 0.7},${near[0] + 1},${near[1] - 0.7}`
      : '';
    const result = await this.http.getJson(
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5' +
        `&accept-language=${lang}&q=${encodeURIComponent(text)}${box}`,
    );
    if (!result.ok || !Array.isArray(result.body)) throw new Error('Place search failed.');
    return (result.body as { lon: string; lat: string; display_name: string; name?: string }[]).map(
      (hit) => {
        const [first, ...rest] = hit.display_name.split(', ');
        return {
          name: hit.name || first,
          detail: rest.join(', '),
          coordinate: [Number(hit.lon), Number(hit.lat)] as const,
          source: this.id,
        };
      },
    );
  }

  /** Photon, because Nominatim does not allow requests while typing. */
  async suggest(text: string, near: Coordinate | null, lang: string): Promise<Place[]> {
    const language = PHOTON_LANGUAGES.includes(lang) ? `&lang=${lang}` : '';
    const bias = near ? `&lon=${near[0].toFixed(2)}&lat=${near[1].toFixed(2)}` : '';
    const result = await this.http.getJson(
      `https://photon.komoot.io/api/?limit=5&q=${encodeURIComponent(text)}${language}${bias}`,
    );
    if (!result.ok) throw new Error('Place suggestions failed.');
    const features =
      (
        result.body as {
          features?: {
            geometry: { coordinates: [number, number] };
            properties: Record<string, string | undefined>;
          }[];
        } | null
      )?.features ?? [];
    return features.map(({ geometry, properties: p }) => {
      const street = [p['street'], p['housenumber']].filter(Boolean).join(' ');
      const town = [p['postcode'], p['city']].filter(Boolean).join(' ');
      const name = p['name'] || street || town || text;
      const detail = [street, town, p['state'], p['country']]
        .filter((part) => part && part !== name)
        .join(', ');
      return { name, detail, coordinate: geometry.coordinates, source: this.id };
    });
  }
}
