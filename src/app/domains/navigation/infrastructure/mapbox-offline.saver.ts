import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { SettingsStore } from '@domains/settings';
import { NavigationStore } from '../application/navigation.store';
import { Coordinate } from '../domain/geo';
import { OfflineSaveJob, OfflineSaver } from '../domain/offline';

/**
 * Keeps the Mapbox map along a route on the device. Only the native SDK may do
 * this; on the web and on other maps there is nothing to save.
 */
@Injectable()
export class MapboxOfflineSaver extends OfflineSaver {
  private readonly settings = inject(SettingsStore).settings;
  private readonly navigation = inject(NavigationStore);

  async save(points: readonly Coordinate[], job: OfflineSaveJob): Promise<boolean> {
    const kind = this.navigation.mapKind();
    if (!Capacitor.isNativePlatform() || kind === 'ofm') return true;
    const { MapboxNative } = await import('@codrivemate/mapbox-native');
    const listener = await MapboxNative.addListener('offlineProgress', ({ share }) =>
      job.progress(share),
    );
    try {
      await MapboxNative.saveOffline({
        // One region: a new route replaces the last one, within Mapbox's 750 tile packs.
        id: 'route',
        token: this.settings().keys.mapbox,
        styles:
          kind === 'mapbox'
            ? ['mapbox://styles/mapbox/standard']
            : [
                'mapbox://styles/mapbox/navigation-day-v1',
                'mapbox://styles/mapbox/navigation-night-v1',
              ],
        points: thin(points),
      });
      return true;
    } finally {
      await listener.remove();
    }
  }
}

/** Tile regions need the course, not every bend. */
function thin(points: readonly Coordinate[]): Coordinate[] {
  const step = Math.max(1, Math.ceil(points.length / 1000));
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}
