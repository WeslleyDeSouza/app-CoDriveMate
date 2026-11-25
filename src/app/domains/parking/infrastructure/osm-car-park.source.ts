import { Injectable, inject } from '@angular/core';
import { HttpPort } from '@core/http';
import { OverpassClient } from '@core/http/overpass';
import { CarPark, CarParkSource } from '../domain/handover';
import { LonLat } from '../domain/parking';

const RADIUS_KM = 2;
const TIMEOUT_MS = 6000;

type Tags = Record<string, string | number | undefined>;

/** Car parks from OpenStreetMap, without a key: Photon, then Overpass. */
@Injectable()
export class OsmCarParkSource extends CarParkSource {
  private readonly http = inject(HttpPort);
  private readonly overpass = inject(OverpassClient);

  async around(at: LonLat): Promise<CarPark[]> {
    const parks = (await this.photon(at).catch(() => null)) ?? (await this.fallback(at));
    if (!parks) throw new Error('Car parks not available.');
    return parks;
  }

  private async photon([lon, lat]: LonLat): Promise<CarPark[] | null> {
    const { ok, body } = await this.http.getJson(
      `https://photon.komoot.io/reverse?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}` +
        `&radius=${RADIUS_KM}&limit=30&osm_tag=amenity:parking`,
      TIMEOUT_MS,
    );
    const features = (
      body as {
        features?: { geometry: { coordinates: [number, number] }; properties: Tags }[];
      } | null
    )?.features;
    if (!ok || !features) return null;
    return features.map(({ geometry, properties: p }) => ({
      id: `${p['osm_type']}${p['osm_id']}`,
      name: String(p['name'] ?? ''),
      address: address(p['street'], p['housenumber'], p['city']),
      at: geometry.coordinates,
    }));
  }

  private fallback([lon, lat]: LonLat): Promise<CarPark[] | null> {
    const around = `${RADIUS_KM * 1000},${lat.toFixed(4)},${lon.toFixed(4)}`;
    return this.overpass.query(
      `[out:json][timeout:15];nwr[amenity=parking][access!=private](around:${around});out center 60;`,
      (body) => {
        const elements = (
          body as {
            elements?: {
              type: string;
              id: number;
              lat?: number;
              lon?: number;
              center?: { lat: number; lon: number };
              tags?: Tags;
            }[];
          } | null
        )?.elements;
        if (!elements) return null;
        return elements.flatMap(({ type, id, lat: y, lon: x, center, tags = {} }): CarPark[] => {
          const place = center ?? (x !== undefined && y !== undefined ? { lat: y, lon: x } : null);
          if (!place) return [];
          return [
            {
              id: type[0].toUpperCase() + id,
              name: String(tags['name'] ?? ''),
              address: address(tags['addr:street'], tags['addr:housenumber'], tags['addr:city']),
              at: [place.lon, place.lat],
            },
          ];
        });
      },
      TIMEOUT_MS,
    );
  }
}

const address = (street: Tags[string], number: Tags[string], city: Tags[string]) =>
  [[street, number].filter(Boolean).join(' '), city].filter(Boolean).join(', ');
