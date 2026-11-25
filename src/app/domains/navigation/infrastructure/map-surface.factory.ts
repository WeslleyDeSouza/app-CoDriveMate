import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { OpenFreeMap } from '@core/map';
import { MapEvents, MapSurface, MapSurfaceFactory, MapSurfaceOptions } from '../domain/ports';

/**
 * Native app + Mapbox: the Mapbox Maps SDK (the only access Mapbox allows in
 * mobile apps). Browser + Mapbox: Mapbox GL JS. OpenFreeMap: MapLibre GL JS.
 * Everything is loaded on demand.
 */
@Injectable()
export class DefaultMapSurfaceFactory extends MapSurfaceFactory {
  private readonly openFreeMap = inject(OpenFreeMap);

  async create(
    container: HTMLElement,
    options: MapSurfaceOptions,
    events: MapEvents,
  ): Promise<MapSurface> {
    if (options.kind === 'google') {
      const { GoogleSurface } = await import('./google-surface');
      return GoogleSurface.create(container, options, events);
    }
    if (options.kind !== 'ofm' && Capacitor.isNativePlatform()) {
      const { NativeSurface } = await import('./native-surface');
      return NativeSurface.create(container, options, events);
    }
    const { GlSurface } = await import('./gl-surface');
    return GlSurface.create(container, options, events, this.openFreeMap);
  }
}
