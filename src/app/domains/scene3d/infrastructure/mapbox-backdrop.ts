import { MapCamera, MapSurface, MapSurfaceFactory } from '@domains/navigation';
import { LonLat, ahead } from '../domain/environment';
import { LightPreset } from '../domain/sun';

const PRELOAD_MS = 3000;
const PRELOAD_AHEAD_M = [200, 500];

/** A Mapbox map below the car: web SDK in the browser, native SDK in the apps. */
export class MapboxBackdrop {
  private surface?: MapSurface;
  private route: readonly LonLat[] | null = null;
  private light?: LightPreset;
  private lastPreload = 0;
  private closed = false;
  private readonly element = document.createElement('div');

  private constructor(container: HTMLElement) {
    this.element.className = 'backdrop';
    container.prepend(this.element);
  }

  static async open(
    container: HTMLElement,
    factory: MapSurfaceFactory,
    token: string,
    camera: MapCamera,
    light: LightPreset,
    onFailure: (keyRejected: boolean) => void,
  ): Promise<MapboxBackdrop> {
    const backdrop = new MapboxBackdrop(container);
    try {
      const surface = await factory.create(
        backdrop.element,
        { id: 'scene', kind: 'mapbox', dark: false, light, token, camera, interactive: false },
        { onUserMove: () => undefined, onFailure },
      );
      backdrop.surface = surface;
      backdrop.light = light;
      await surface.setBuildings(true);
      await surface.addSource('cdm-scene-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      await surface.addLayer({
        id: 'cdm-scene-route',
        type: 'line',
        source: 'cdm-scene-route',
        slot: 'middle',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#4c8dff',
          'line-opacity': 0.85,
          'line-emissive-strength': 1,
          // about 2.6 m wide on the ground
          'line-width': ['interpolate', ['exponential', 2], ['zoom'], 16, 3, 22, 190],
        },
      });
      return backdrop;
    } catch (error) {
      backdrop.close();
      throw error;
    }
  }

  setCamera(camera: MapCamera, heading: number, time: number): void {
    this.surface?.moveTo(camera, 0);
    if (time - this.lastPreload < PRELOAD_MS) return;
    this.lastPreload = time;
    // Loads what comes next, so that buildings stand there when the car arrives.
    for (const distance of PRELOAD_AHEAD_M) {
      this.surface?.preload({ ...camera, center: ahead(camera.center, heading, distance) });
    }
  }

  setLight(light: LightPreset): void {
    if (light === this.light) return;
    this.light = light;
    void this.surface?.setLight(light).catch(() => undefined);
  }

  setRoute(points: readonly LonLat[] | null): void {
    if (points === this.route && points !== null) return;
    this.route = points;
    const feature = points && {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: points },
    };
    void this.surface
      ?.setData('cdm-scene-route', {
        type: 'FeatureCollection',
        features: feature ? [feature] : [],
      })
      .catch(() => undefined);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.surface?.destroy();
    this.surface = undefined;
    this.element.remove();
  }
}
