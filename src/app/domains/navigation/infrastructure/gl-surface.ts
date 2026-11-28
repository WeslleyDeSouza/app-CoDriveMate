import { OPEN_FREE_MAP, OpenFreeMap } from '@core/map';
import {
  MapCamera,
  MapEvents,
  MapIcon,
  MapLight,
  MapSurface,
  MapSurfaceOptions,
} from '../domain/ports';
import { ARROW_PX, drawIcon } from './arrow';

/** The part of the API that Mapbox GL JS and MapLibre GL JS have in common. */
interface GlMap {
  on(type: string, listener: (event: GlEvent) => void): unknown;
  addSource(id: string, source: object): unknown;
  getSource(id: string): { setData?(data: object): void } | undefined;
  addLayer(layer: object, before?: string): unknown;
  getLayer(id: string): unknown;
  getStyle(): { layers: { id: string; type: string }[]; sources: Record<string, unknown> };
  setLayoutProperty(layer: string, name: string, value: unknown): unknown;
  setConfigProperty?(importId: string, name: string, value: unknown): unknown;
  addImage(id: string, image: ImageData, options: { pixelRatio: number }): unknown;
  easeTo(options: object): unknown;
  jumpTo(options: object): unknown;
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  getBearing(): number;
  getPitch(): number;
  resize(): unknown;
  remove(): void;
}

interface GlEvent {
  originalEvent?: unknown;
  error?: { status?: number; message?: string };
}

const LOAD_TIMEOUT_MS = 20000;
/** Addresses answered by the store on the device. */
const STORED = 'stored';

/** Map in the web view: Mapbox GL JS for Mapbox, MapLibre GL JS for OpenFreeMap. */
export class GlSurface implements MapSurface {
  private constructor(
    private readonly map: GlMap,
    private readonly options: MapSurfaceOptions,
    private readonly observer: ResizeObserver,
  ) {}

  static async create(
    container: HTMLElement,
    options: MapSurfaceOptions,
    events: MapEvents,
    openFreeMap: OpenFreeMap,
  ): Promise<GlSurface> {
    const map =
      options.kind === 'ofm'
        ? await createMapLibre(container, options, openFreeMap)
        : await createMapbox(container, options);
    const observer = new ResizeObserver(() => map.resize());
    const surface = new GlSurface(map, options, observer);

    let loaded = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Map style timed out.')), LOAD_TIMEOUT_MS);
        map.on('style.load', () => {
          loaded = true;
          clearTimeout(timer);
          resolve();
        });
        map.on('error', ({ error }) => {
          const rejected = /\b40[13]\b/.test(`${error?.status ?? ''} ${error?.message ?? ''}`);
          if (!loaded) {
            clearTimeout(timer);
            reject(Object.assign(new Error(error?.message ?? 'Map failed.'), { rejected }));
          } else if (rejected && options.kind !== 'ofm') {
            events.onFailure(true);
          }
        });
      });
    } catch (error) {
      map.remove();
      throw error;
    }

    observer.observe(container);
    // Only events with an original event come from the user's fingers or mouse.
    const user = (type: string, by: 'pan' | 'zoom' | 'rotate' | 'pitch') =>
      map.on(type, (event) => {
        // Zooming with two fingers also drags; that must not end following the car.
        const fingers = (event.originalEvent as TouchEvent | undefined)?.touches?.length ?? 1;
        if (!event.originalEvent || (by === 'pan' && fingers > 1)) return;
        events.onUserMove(by, surface.camera());
      });
    user('dragstart', 'pan');
    user('zoom', 'zoom');
    user('rotate', 'rotate');
    // Two fingers moving up or down together: the gesture the map brings along.
    user('pitch', 'pitch');
    return surface;
  }

  async addSource(id: string, source: object): Promise<void> {
    this.map.addSource(id, source);
  }

  async setData(id: string, geojson: object): Promise<void> {
    this.map.getSource(id)?.setData?.(geojson);
  }

  async addLayer(layer: object): Promise<void> {
    this.map.addLayer(layer);
  }

  async setVisible(layerId: string, visible: boolean): Promise<void> {
    if (!this.map.getLayer(layerId)) return;
    this.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
  }

  async addIcon(id: string, icon: MapIcon): Promise<void> {
    const image = drawIcon(icon).getContext('2d')?.getImageData(0, 0, ARROW_PX, ARROW_PX);
    if (image) this.map.addImage(id, image, { pixelRatio: 2 });
  }

  async setBuildings(visible: boolean): Promise<void> {
    if (this.options.kind === 'mapbox') {
      this.map.setConfigProperty?.('basemap', 'show3dObjects', visible);
      return;
    }
    const style = this.map.getStyle();
    if (!style.layers.some((layer) => layer.type === 'fill-extrusion') && visible) {
      const source = this.options.kind === 'ofm' ? 'openmaptiles' : 'composite';
      if (!style.sources[source]) return;
      const height = this.options.kind === 'ofm' ? 'render_height' : 'height';
      const base = this.options.kind === 'ofm' ? 'render_min_height' : 'min_height';
      this.map.addLayer(
        {
          id: 'cdm-buildings',
          type: 'fill-extrusion',
          source,
          'source-layer': 'building',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': this.options.dark ? '#2a2e37' : '#d9dce2',
            'fill-extrusion-height': ['coalesce', ['get', height], 8],
            'fill-extrusion-base': ['coalesce', ['get', base], 0],
            'fill-extrusion-opacity': 0.85,
          },
        },
        style.layers.find((layer) => layer.type === 'symbol')?.id,
      );
    }
    for (const layer of this.map.getStyle().layers) {
      if (layer.type === 'fill-extrusion') await this.setVisible(layer.id, visible);
    }
  }

  moveTo(camera: MapCamera, durationMs: number): void {
    this.map.easeTo({ ...camera, duration: durationMs, easing: (t: number) => t });
  }

  preload(camera: MapCamera): void {
    if (this.options.kind !== 'ofm') {
      // Not easeTo: its preview of the way fails at steep angles.
      this.map.jumpTo({ ...camera, preloadOnly: true });
    }
  }

  async setLight(preset: MapLight): Promise<void> {
    if (this.options.kind === 'mapbox') {
      this.map.setConfigProperty?.('basemap', 'lightPreset', preset);
    }
  }

  camera(): MapCamera {
    const { lng, lat } = this.map.getCenter();
    return {
      center: [lng, lat],
      zoom: this.map.getZoom(),
      bearing: (this.map.getBearing() + 360) % 360,
      pitch: this.map.getPitch(),
    };
  }

  destroy(): void {
    this.observer.disconnect();
    this.map.remove();
  }
}

async function createMapbox(container: HTMLElement, options: MapSurfaceOptions): Promise<GlMap> {
  await stylesheet('mapbox-gl.css');
  const { default: mapboxgl } = await import('mapbox-gl');
  const { center, ...camera } = options.camera;
  const navigation = 'mapbox://styles/mapbox/navigation-' + (options.dark ? 'night-v1' : 'day-v1');
  return new mapboxgl.Map({
    container,
    accessToken: options.token,
    ...camera,
    center: [center[0], center[1]],
    maxPitch: 85,
    interactive: options.interactive ?? true,
    ...(options.kind === 'mapbox'
      ? {
          style: 'mapbox://styles/mapbox/standard',
          config: { basemap: { lightPreset: options.light ?? (options.dark ? 'night' : 'day') } },
        }
      : { style: navigation }),
  }) as unknown as GlMap;
}

async function createMapLibre(
  container: HTMLElement,
  options: MapSurfaceOptions,
  openFreeMap: OpenFreeMap,
): Promise<GlMap> {
  await stylesheet('maplibre-gl.css');
  const maplibre = await import('maplibre-gl');
  // The bundler cannot see the worker, so it ships as an asset of our own origin.
  maplibre.setWorkerUrl(new URL('assets/maplibre/maplibre-gl-worker.mjs', document.baseURI).href);
  maplibre.addProtocol(STORED, async ({ url, type }) => {
    const bytes = await openFreeMap.resource(url.replace(STORED + '://', 'https://'));
    if (!bytes) throw new Error('Not stored and not reachable.');
    return { data: type === 'json' ? JSON.parse(new TextDecoder().decode(bytes)) : bytes };
  });
  const { center, ...camera } = options.camera;
  return new maplibre.Map({
    container,
    style: OPEN_FREE_MAP + '/styles/' + (options.dark ? 'dark' : 'liberty'),
    ...camera,
    center: [center[0], center[1]],
    attributionControl: { compact: false },
    transformRequest: (url) => ({
      url: url.startsWith(OPEN_FREE_MAP + '/') ? url.replace('https://', STORED + '://') : url,
    }),
  }) as unknown as GlMap;
}

/** Loads the stylesheet of a map library once, when it is needed. */
function stylesheet(file: string): Promise<void> {
  if (document.querySelector(`link[data-map-css="${file}"]`)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL(file, document.baseURI).href;
    link.dataset['mapCss'] = file;
    link.onload = () => resolve();
    link.onerror = () => {
      link.remove(); // otherwise a retry would take it for loaded
      reject(new Error(`${file} not found`));
    };
    document.head.append(link);
  });
}
