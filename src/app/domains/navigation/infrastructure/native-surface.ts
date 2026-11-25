import { MapboxNative } from '@codrivemate/mapbox-native';
import { panCenter } from '../domain/geo';
import {
  MapCamera,
  MapEvents,
  MapIcon,
  MapLight,
  MapSurface,
  MapSurfaceOptions,
} from '../domain/ports';
import { drawIcon } from './arrow';

/** Marks the document so that everything above the native map is transparent. */
const CSS_CLASS = 'native-map';

/**
 * Mapbox Maps SDK for iOS and Android. The native view lies behind the web
 * view, which gets all touches; gestures are therefore handled here.
 */
export class NativeSurface implements MapSurface {
  private static open = 0;
  private current: MapCamera;
  private closed = false;
  private readonly cleanup: (() => void)[] = [];
  private readonly pointers = new Map<number, { x: number; y: number }>();

  private constructor(
    private readonly container: HTMLElement,
    private readonly mapId: string,
    camera: MapCamera,
    private readonly events: MapEvents,
  ) {
    this.current = camera;
  }

  static async create(
    container: HTMLElement,
    options: MapSurfaceOptions,
    events: MapEvents,
  ): Promise<NativeSurface> {
    const mapId = options.id ?? 'main';
    const surface = new NativeSurface(container, mapId, options.camera, events);
    const listener = await MapboxNative.addListener('mapError', (error) => {
      if (error.mapId === mapId && error.rejected) events.onFailure(true);
    });
    surface.cleanup.push(() => void listener.remove());
    NativeSurface.open++;
    document.documentElement.classList.add(CSS_CLASS);
    try {
      await MapboxNative.create({
        mapId,
        token: options.token,
        style:
          options.kind === 'mapbox'
            ? 'mapbox://styles/mapbox/standard'
            : 'mapbox://styles/mapbox/navigation-' + (options.dark ? 'night-v1' : 'day-v1'),
        frame: surface.frame(),
        camera: options.camera,
      });
      if (options.kind === 'mapbox') {
        await MapboxNative.setConfig({
          mapId,
          name: 'lightPreset',
          value: options.light ?? (options.dark ? 'night' : 'day'),
        });
      }
    } catch (error) {
      surface.destroy();
      throw error;
    }
    surface.standard = options.kind === 'mapbox';
    surface.observe(options.interactive ?? true);
    return surface;
  }

  private standard = false;

  async addSource(id: string, source: object): Promise<void> {
    await MapboxNative.addSource({ mapId: this.mapId, id, source: JSON.stringify(source) });
  }

  async setData(id: string, geojson: object): Promise<void> {
    await MapboxNative.setData({ mapId: this.mapId, id, data: JSON.stringify(geojson) });
  }

  async addLayer(layer: object): Promise<void> {
    await MapboxNative.addLayer({ mapId: this.mapId, layer: JSON.stringify(layer) });
  }

  async setVisible(id: string, visible: boolean): Promise<void> {
    await MapboxNative.setVisible({ mapId: this.mapId, id, visible });
  }

  async addIcon(id: string, icon: MapIcon): Promise<void> {
    const png = drawIcon(icon).toDataURL('image/png').split(',')[1];
    await MapboxNative.addImage({ mapId: this.mapId, id, png, scale: 2 });
  }

  async setBuildings(visible: boolean): Promise<void> {
    await this.config('show3dObjects', visible);
  }

  moveTo(camera: MapCamera, durationMs: number): void {
    this.current = camera;
    void MapboxNative.setCamera({ mapId: this.mapId, camera, durationMs }).catch(() => undefined);
  }

  preload(): void {
    // The SDK reads ahead by itself and from the saved region of the route.
  }

  setLight(preset: MapLight): Promise<void> {
    return this.config('lightPreset', preset);
  }

  private async config(name: string, value: string | boolean): Promise<void> {
    if (this.standard) await MapboxNative.setConfig({ mapId: this.mapId, name, value });
  }

  camera(): MapCamera {
    return this.current;
  }

  destroy(): void {
    if (this.closed) return;
    this.closed = true;
    this.cleanup.splice(0).forEach((undo) => undo());
    if (--NativeSurface.open === 0) document.documentElement.classList.remove(CSS_CLASS);
    void MapboxNative.destroy({ mapId: this.mapId }).catch(() => undefined);
  }

  private frame() {
    const { left, top, width, height } = this.container.getBoundingClientRect();
    return { x: left, y: top, width, height };
  }

  private observe(interactive: boolean): void {
    const resize = () =>
      void MapboxNative.setFrame({ mapId: this.mapId, frame: this.frame() }).catch(() => undefined);
    const observer = new ResizeObserver(resize);
    observer.observe(this.container);
    this.cleanup.push(() => observer.disconnect());
    this.listen(window, 'resize', resize);
    this.listen(window, 'scroll', resize);

    if (!interactive) return;
    this.container.style.touchAction = 'none';
    this.listen<PointerEvent>(this.container, 'pointerdown', (event) => {
      this.container.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    });
    this.listen<PointerEvent>(this.container, 'pointermove', (event) => this.drag(event));
    const release = (event: PointerEvent) => this.pointers.delete(event.pointerId);
    this.listen<PointerEvent>(this.container, 'pointerup', release);
    this.listen<PointerEvent>(this.container, 'pointercancel', release);
  }

  private drag(event: PointerEvent): void {
    const from = this.pointers.get(event.pointerId);
    if (!from || this.pointers.size > 2) return;
    const to = { x: event.clientX, y: event.clientY };
    const other = [...this.pointers].find(([id]) => id !== event.pointerId)?.[1];
    this.pointers.set(event.pointerId, to);
    const { center, zoom, bearing, pitch } = this.current;

    if (!other) {
      if (from.x === to.x && from.y === to.y) return;
      this.moveTo(
        {
          ...this.current,
          center: panCenter(center, zoom, bearing, pitch, to.x - from.x, to.y - from.y),
        },
        0,
      );
      this.events.onUserMove('pan', this.current);
      return;
    }
    const before = { x: from.x - other.x, y: from.y - other.y };
    const after = { x: to.x - other.x, y: to.y - other.y };
    const scale = Math.hypot(after.x, after.y) / (Math.hypot(before.x, before.y) || 1);
    const turn = ((Math.atan2(after.y, after.x) - Math.atan2(before.y, before.x)) * 180) / Math.PI;
    const normalised = ((turn + 540) % 360) - 180;
    this.moveTo(
      {
        ...this.current,
        zoom: Math.max(2, Math.min(20, zoom + Math.log2(scale || 1))),
        bearing: (bearing - normalised + 360) % 360,
      },
      0,
    );
    this.events.onUserMove('zoom', this.current);
    if (Math.abs(normalised) > 0.5) this.events.onUserMove('rotate', this.current);
  }

  private listen<E extends Event>(
    target: EventTarget,
    type: string,
    listener: (event: E) => void,
  ): void {
    target.addEventListener(type, listener as EventListener);
    this.cleanup.push(() => target.removeEventListener(type, listener as EventListener));
  }
}
