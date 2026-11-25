import { Coordinate } from '../domain/geo';
import { MapKind } from '../domain/map-choice';
import { MapSurface } from '../domain/ports';
import { Route } from '../domain/route';

const EMPTY = { type: 'FeatureCollection', features: [] };
const ROUND = { 'line-cap': 'round', 'line-join': 'round' };

const line = (points: readonly Coordinate[], properties: object = {}) => ({
  type: 'Feature',
  properties,
  geometry: { type: 'LineString', coordinates: points },
});

/** Everything CoDriveMate draws on a map, independent of the map library. */
export class MapScene {
  constructor(
    private readonly surface: MapSurface,
    private readonly kind: MapKind,
  ) {}

  async build(): Promise<void> {
    const s = this.surface;
    // Mapbox Standard orders foreign layers by slots.
    const slot = (name: string) => (this.kind === 'mapbox' ? { slot: name } : {});

    // ... and dims them at night unless they glow by themselves. MapLibre knows no lighting.
    const glow = (type: 'line' | 'icon') =>
      this.kind === 'mapbox' ? { [type + '-emissive-strength']: 1 } : {};

    if (this.kind !== 'ofm') {
      await s.addSource('cdm-traffic', {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-traffic-v1',
      });
      await s.addLayer({
        id: 'cdm-traffic',
        type: 'line',
        source: 'cdm-traffic',
        'source-layer': 'traffic',
        ...slot('middle'),
        filter: ['in', ['get', 'congestion'], ['literal', ['moderate', 'heavy', 'severe']]],
        paint: {
          ...glow('line'),
          'line-color': [
            'match',
            ['get', 'congestion'],
            'moderate',
            '#f5a524',
            'heavy',
            '#e5484d',
            '#9b1c1c',
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 17, 4],
          'line-offset': ['interpolate', ['linear'], ['zoom'], 12, 1, 17, 3],
        },
      });
    }

    await s.addSource('cdm-route', { type: 'geojson', data: EMPTY });
    await s.addLayer({
      id: 'cdm-route-casing',
      type: 'line',
      source: 'cdm-route',
      ...slot('middle'),
      layout: ROUND,
      paint: {
        ...glow('line'),
        'line-color': '#1d4ed8',
        'line-width': 12,
      },
    });
    await s.addLayer({
      id: 'cdm-route',
      type: 'line',
      source: 'cdm-route',
      ...slot('middle'),
      layout: ROUND,
      paint: {
        ...glow('line'),
        'line-color': '#5b9bff',
        'line-width': 7,
      },
    });
    await s.addSource('cdm-track', { type: 'geojson', data: EMPTY });
    await s.addLayer({
      id: 'cdm-track',
      type: 'line',
      source: 'cdm-track',
      ...slot('middle'),
      layout: ROUND,
      paint: { ...glow('line'), 'line-color': '#a78bfa', 'line-width': 5 },
    });
    await s.addSource('cdm-congestion', { type: 'geojson', data: EMPTY });
    await s.addLayer({
      id: 'cdm-congestion',
      type: 'line',
      source: 'cdm-congestion',
      ...slot('middle'),
      layout: ROUND,
      paint: {
        ...glow('line'),
        'line-color': ['match', ['get', 'level'], 'jam', '#e5484d', '#f5a524'],
        'line-width': 7,
      },
    });

    await s.addIcon('cdm-parking', 'parking');
    await s.addIcon('cdm-fuel', 'fuel');
    await s.addIcon('cdm-warning', 'warning');
    await s.addSource('cdm-pins', { type: 'geojson', data: EMPTY });
    await s.addLayer({
      id: 'cdm-pins',
      type: 'symbol',
      source: 'cdm-pins',
      ...slot('top'),
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': 0.8,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: glow('icon'),
    });

    await s.addIcon('cdm-arrow', 'arrow');
    await s.addSource('cdm-me', { type: 'geojson', data: EMPTY });
    await s.addLayer({
      id: 'cdm-me',
      type: 'symbol',
      source: 'cdm-me',
      ...slot('top'),
      layout: {
        'icon-image': 'cdm-arrow',
        'icon-rotate': ['get', 'heading'],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: glow('icon'),
    });
  }

  async showRoute(route: Route | null): Promise<void> {
    await this.surface.setData('cdm-route', {
      type: 'FeatureCollection',
      features: route ? [line(route.line.points)] : [],
    });
    await this.surface.setData('cdm-congestion', {
      type: 'FeatureCollection',
      features: (route?.congestion ?? []).map((c) => line(c.points, { level: c.level })),
    });
  }

  async showPosition(coordinate: Coordinate, heading: number): Promise<void> {
    await this.surface.setData('cdm-me', {
      type: 'Feature',
      properties: { heading },
      geometry: { type: 'Point', coordinates: coordinate },
    });
  }

  async showTrack(points: readonly Coordinate[] | null): Promise<void> {
    await this.surface.setData('cdm-track', {
      type: 'FeatureCollection',
      features: points ? [line(points)] : [],
    });
  }

  async showPins(pins: readonly { coordinate: Coordinate; icon: string }[]): Promise<void> {
    await this.surface.setData('cdm-pins', {
      type: 'FeatureCollection',
      features: pins.map(({ coordinate, icon }) => ({
        type: 'Feature',
        properties: { icon: 'cdm-' + icon },
        geometry: { type: 'Point', coordinates: coordinate },
      })),
    });
  }

  async showTraffic(visible: boolean): Promise<void> {
    if (this.kind !== 'ofm') await this.surface.setVisible('cdm-traffic', visible);
  }
}
