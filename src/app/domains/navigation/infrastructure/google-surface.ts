import { Coordinate } from '../domain/geo';
import { MapCamera, MapEvents, MapIcon, MapSurface, MapSurfaceOptions } from '../domain/ports';
import { ARROW_PX, drawIcon } from './arrow';

/** The part of the Google Maps JavaScript API that is used here. */
interface LatLng {
  lat: number;
  lng: number;
}
interface GoogleMap {
  moveCamera(camera: { center: LatLng; zoom: number; heading: number; tilt: number }): void;
  addListener(event: string, listener: () => void): void;
  getCenter(): { lat(): number; lng(): number } | undefined;
  getZoom(): number | undefined;
  getHeading(): number | undefined;
  getTilt(): number | undefined;
}
interface Overlay {
  setMap(map: GoogleMap | null): void;
}
interface GoogleApi {
  importLibrary(name: string): Promise<unknown>;
  Map: new (element: HTMLElement, options: object) => GoogleMap;
  Polyline: new (options: object) => Overlay;
  Marker: new (options: object) => Overlay;
  TrafficLayer: new () => Overlay;
}
interface GoogleWindow {
  google?: { maps: GoogleApi };
  gm_authFailure?: () => void;
  cdmGoogleReady?: () => void;
}

interface Layer {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly paint?: Record<string, unknown>;
  readonly layout?: Record<string, unknown>;
}
interface Feature {
  readonly properties?: Record<string, unknown> | null;
  readonly geometry: { readonly type: string; readonly coordinates: unknown };
}

const LOAD_TIMEOUT_MS = 20_000;
/** Google counts tiles of 256 pixels, the others of 512. */
const ZOOM_OFFSET = 1;
const MAX_TILT = 67.5;

let loading: Promise<GoogleApi> | undefined;
let loadedKey = '';

/**
 * Google Maps. Its API may only be loaded from Google itself, so this is the
 * one script that does not ship with the app; it loads only when the user
 * chose this map and entered a key.
 */
function load(key: string): Promise<GoogleApi> {
  const scope = globalThis as unknown as GoogleWindow;
  // The API can be loaded only once; another key needs a new start.
  if (loading && loadedKey === key) return loading;
  if (loading) return Promise.reject(new Error('Google Maps needs a restart for another key.'));
  loadedKey = key;
  loading = new Promise<GoogleApi>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Google Maps timed out.')), LOAD_TIMEOUT_MS);
    scope.cdmGoogleReady = () => {
      clearTimeout(timer);
      if (scope.google) resolve(scope.google.maps);
      else reject(new Error('Google Maps failed.'));
    };
    const script = document.createElement('script');
    script.async = true;
    script.src =
      'https://maps.googleapis.com/maps/api/js?v=weekly&loading=async&callback=cdmGoogleReady' +
      '&region=CH&key=' +
      encodeURIComponent(key);
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error('Google Maps is not reachable.'));
    };
    document.head.append(script);
  });
  loading.catch(() => (loading = undefined));
  return loading;
}

/** Draws the few kinds of layers the scene uses on a Google map. */
export class GoogleSurface implements MapSurface {
  private readonly data = new Map<string, readonly Feature[]>();
  private readonly layers: Layer[] = [];
  private readonly overlays = new Map<string, Overlay[]>();
  private readonly icons = new Map<string, MapIcon>();
  private readonly images = new Map<string, string>();
  private readonly hidden = new Set<string>();
  private traffic?: Overlay;
  private current: MapCamera;
  private frame = 0;
  private ownMove = 0;

  private constructor(
    private readonly api: GoogleApi,
    private readonly map: GoogleMap,
    camera: MapCamera,
    private readonly restore: () => void,
  ) {
    this.current = camera;
  }

  static async create(
    container: HTMLElement,
    options: MapSurfaceOptions,
    events: MapEvents,
  ): Promise<GoogleSurface> {
    const scope = globalThis as unknown as GoogleWindow;
    const before = scope.gm_authFailure;
    scope.gm_authFailure = () => events.onFailure(true);
    const api = await load(options.token);
    await api.importLibrary('maps');
    await api.importLibrary('marker');
    const map = new api.Map(container, {
      ...googleCamera(options.camera),
      renderingType: 'VECTOR',
      colorScheme: options.dark ? 'DARK' : 'LIGHT',
      isFractionalZoomEnabled: true,
      disableDefaultUI: true,
      clickableIcons: false,
      gestureHandling: options.interactive === false ? 'none' : 'greedy',
      headingInteractionEnabled: true,
      tiltInteractionEnabled: true,
    });
    const surface = new GoogleSurface(api, map, options.camera, () => {
      scope.gm_authFailure = before;
    });
    const user = (by: 'pan' | 'zoom' | 'rotate' | 'pitch') => () => {
      if (Date.now() - surface.ownMove < 250) return;
      surface.current = surface.read();
      events.onUserMove(by, surface.current);
    };
    map.addListener('dragstart', () => {
      cancelAnimationFrame(surface.frame);
      surface.ownMove = 0;
      user('pan')();
    });
    map.addListener('zoom_changed', user('zoom'));
    map.addListener('tilt_changed', user('pitch'));
    map.addListener('heading_changed', () => {
      user('rotate')();
      // Markers lie on the screen, so the arrow turns against the map.
      surface.draw(surface.layers.find(({ id }) => id === 'cdm-me'));
    });
    return surface;
  }

  async addSource(id: string, source: object): Promise<void> {
    const { type, data } = source as { type: string; data?: object };
    if (type === 'geojson') this.data.set(id, features(data));
  }

  async setData(id: string, geojson: object): Promise<void> {
    this.data.set(id, features(geojson));
    for (const layer of this.layers) if (layer.source === id) this.draw(layer);
  }

  async addLayer(layer: object): Promise<void> {
    const added = layer as Layer;
    this.layers.push(added);
    if (added.id === 'cdm-traffic') await this.setVisible(added.id, true);
    else this.draw(added);
  }

  async setVisible(id: string, visible: boolean): Promise<void> {
    if (id === 'cdm-traffic') {
      this.traffic ??= new this.api.TrafficLayer();
      this.traffic.setMap(visible ? this.map : null);
      return;
    }
    if (visible) this.hidden.delete(id);
    else this.hidden.add(id);
    this.draw(this.layers.find((layer) => layer.id === id));
  }

  async addIcon(id: string, icon: MapIcon): Promise<void> {
    this.icons.set(id, icon);
  }

  async setBuildings(): Promise<void> {
    // Google decides by itself.
  }

  moveTo(camera: MapCamera, durationMs: number): void {
    cancelAnimationFrame(this.frame);
    const from = this.current;
    const start = performance.now();
    const turn = ((camera.bearing - from.bearing + 540) % 360) - 180;
    const step = (now: number) => {
      const t = durationMs > 0 ? Math.min(1, (now - start) / durationMs) : 1;
      const mix = (a: number, b: number) => a + (b - a) * t;
      this.current = {
        center: [mix(from.center[0], camera.center[0]), mix(from.center[1], camera.center[1])],
        zoom: mix(from.zoom, camera.zoom),
        bearing: (from.bearing + turn * t + 360) % 360,
        pitch: mix(from.pitch, camera.pitch),
      };
      this.ownMove = Date.now();
      this.map.moveCamera(googleCamera(this.current));
      if (t < 1) this.frame = requestAnimationFrame(step);
    };
    step(start);
  }

  preload(): void {
    // Google data is not kept.
  }

  async setLight(): Promise<void> {
    // The colours are chosen when the map is created.
  }

  camera(): MapCamera {
    return this.current;
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.overlays.forEach((list) => list.forEach((overlay) => overlay.setMap(null)));
    this.traffic?.setMap(null);
    this.restore();
  }

  private read(): MapCamera {
    const center = this.map.getCenter();
    return {
      center: center ? [center.lng(), center.lat()] : this.current.center,
      zoom: (this.map.getZoom() ?? this.current.zoom + ZOOM_OFFSET) - ZOOM_OFFSET,
      bearing: ((this.map.getHeading() ?? 0) + 360) % 360,
      pitch: this.map.getTilt() ?? this.current.pitch,
    };
  }

  private draw(layer: Layer | undefined): void {
    if (!layer) return;
    this.overlays.get(layer.id)?.forEach((overlay) => overlay.setMap(null));
    this.overlays.delete(layer.id);
    if (this.hidden.has(layer.id)) return;
    const zIndex = this.layers.indexOf(layer);
    const drawn = (this.data.get(layer.source) ?? []).flatMap((feature): Overlay[] => {
      if (layer.type === 'line' && feature.geometry.type === 'LineString') {
        return [this.line(layer, feature, zIndex)];
      }
      if (layer.type === 'symbol' && feature.geometry.type === 'Point') {
        return [this.marker(layer, feature, zIndex)];
      }
      return [];
    });
    this.overlays.set(layer.id, drawn);
  }

  private line({ paint = {} }: Layer, feature: Feature, zIndex: number): Overlay {
    const width = paint['line-width'];
    return new this.api.Polyline({
      map: this.map,
      path: (feature.geometry.coordinates as Coordinate[]).map(latLng),
      strokeColor: String(evaluate(paint['line-color'], feature) ?? '#5b9bff'),
      strokeWeight: typeof width === 'number' ? width : 6,
      clickable: false,
      zIndex,
    });
  }

  private marker({ layout = {} }: Layer, feature: Feature, zIndex: number): Overlay {
    const icon = this.icons.get(String(evaluate(layout['icon-image'], feature))) ?? 'arrow';
    const heading = Number(feature.properties?.['heading'] ?? 0);
    const angle = icon === 'arrow' ? heading - this.current.bearing : 0;
    const size =
      (ARROW_PX / 2) * (typeof layout['icon-size'] === 'number' ? layout['icon-size'] : 1);
    return new this.api.Marker({
      map: this.map,
      position: latLng(feature.geometry.coordinates as Coordinate),
      icon: {
        url: this.image(icon, angle),
        scaledSize: { width: size, height: size },
        anchor: { x: size / 2, y: size / 2 },
      },
      clickable: false,
      optimized: true,
      zIndex,
    });
  }

  private image(icon: MapIcon, angle: number): string {
    const rounded = Math.round((((angle % 360) + 360) % 360) / 5) * 5;
    const key = icon + rounded;
    const known = this.images.get(key);
    if (known) return known;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ARROW_PX;
    const c = canvas.getContext('2d');
    c?.translate(ARROW_PX / 2, ARROW_PX / 2);
    c?.rotate((rounded * Math.PI) / 180);
    c?.drawImage(drawIcon(icon), -ARROW_PX / 2, -ARROW_PX / 2);
    const url = canvas.toDataURL();
    this.images.set(key, url);
    return url;
  }
}

const latLng = ([lng, lat]: Coordinate): LatLng => ({ lat, lng });

function googleCamera({ center, zoom, bearing, pitch }: MapCamera) {
  return {
    center: latLng(center),
    zoom: zoom + ZOOM_OFFSET,
    heading: bearing,
    tilt: Math.min(MAX_TILT, pitch),
  };
}

function features(data: object | undefined): readonly Feature[] {
  const geojson = data as { type?: string; features?: Feature[] } | undefined;
  if (geojson?.type === 'FeatureCollection') return geojson.features ?? [];
  return geojson?.type === 'Feature' ? [geojson as unknown as Feature] : [];
}

/** The two style expressions the scene uses: ['get', name] and ['match', ['get', name], …]. */
export function evaluate(value: unknown, feature: Feature): unknown {
  if (!Array.isArray(value)) return value;
  const [operator, ...rest] = value as unknown[];
  if (operator === 'get') return feature.properties?.[String(rest[0])];
  if (operator !== 'match') return undefined;
  const [input, ...cases] = rest;
  const actual = evaluate(input, feature);
  for (let i = 0; i + 1 < cases.length; i += 2) if (cases[i] === actual) return cases[i + 1];
  return cases[cases.length - 1];
}
