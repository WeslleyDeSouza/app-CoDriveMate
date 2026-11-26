import { OfflineArea } from '../domain/offline-areas';
import { Injectable, inject } from '@angular/core';
import { CacheStore, KeyValueStore, LegacyMigration } from '@core/storage';
import { NO_PLACES, SavedPlaces } from '../domain/saved-places';
import { PlannedTrip, validTrips } from '../domain/planned-trips';
import { DEFAULT_MAP_PREFERENCES, MapPreferences, NavigationRepository } from '../domain/ports';

const PREFERENCES_KEY = 'navigation/map';
const EXHAUSTED_KEY = 'navigation/exhausted';
const PLACES_KEY = 'navigation/places';
const TRIPS_KEY = 'navigation/trips';

interface OldPreferences {
  bearingLock?: number | null;
}

const AREA_BUCKET = 'offline-areas';

@Injectable()
export class IdbNavigationRepository extends NavigationRepository {
  private readonly kv = inject(KeyValueStore);
  private readonly cache = inject(CacheStore);

  async loadPreferences(): Promise<MapPreferences> {
    const stored = await this.kv.get<Partial<MapPreferences> & OldPreferences>(PREFERENCES_KEY);
    const { bearingLock, ...rest } = stored ?? {};
    // Earlier versions kept a fixed rotation instead of a mode.
    const follow = typeof bearingLock === 'number' ? 'north' : DEFAULT_MAP_PREFERENCES.follow;
    return { ...DEFAULT_MAP_PREFERENCES, follow, ...rest };
  }

  savePreferences(preferences: MapPreferences): Promise<void> {
    return this.kv.set(PREFERENCES_KEY, preferences);
  }

  async loadOfflineAreas(): Promise<readonly OfflineArea[]> {
    return (await this.cache.get<OfflineArea[]>(AREA_BUCKET, 'all')) ?? [];
  }

  saveOfflineAreas(areas: readonly OfflineArea[]): Promise<void> {
    return this.cache.put(AREA_BUCKET, 'all', areas);
  }

  async loadExhausted(): Promise<Record<string, string>> {
    return (await this.kv.get<Record<string, string>>(EXHAUSTED_KEY)) ?? {};
  }

  saveExhausted(entries: Record<string, string>): Promise<void> {
    return this.kv.set(EXHAUSTED_KEY, entries);
  }

  async loadPlaces(): Promise<SavedPlaces> {
    return { ...NO_PLACES, ...(await this.kv.get<Partial<SavedPlaces>>(PLACES_KEY)) };
  }

  savePlaces(places: SavedPlaces): Promise<void> {
    return this.kv.set(PLACES_KEY, places);
  }

  async loadTrips(): Promise<readonly PlannedTrip[]> {
    return validTrips(await this.kv.get<unknown>(TRIPS_KEY));
  }

  saveTrips(trips: readonly PlannedTrip[]): Promise<void> {
    return this.kv.set(TRIPS_KEY, trips);
  }
}

/** Imports zoom, rotation and tilt of the prototype's map. */
export const navigationLegacyMigration: LegacyMigration = {
  id: 'navigation-v1',
  async migrate({ source, kv }) {
    const zoom = source.localRaw('pd_zoom');
    const rotation = source.localRaw('pd_rot');
    const flat = source.localJson<{ map3d?: string }>('pdrive2')?.map3d === '0';
    if (zoom === null && rotation === null && !flat) return;
    if ((await kv.get(PREFERENCES_KEY)) !== undefined) return;
    const finite = (raw: string | null) =>
      raw && Number.isFinite(Number(raw)) ? Number(raw) : null;
    const preferences: MapPreferences = {
      zoomOffset: Math.max(-6, Math.min(5, finite(zoom) ?? 0)),
      follow: finite(rotation) === null ? 'heading' : 'north',
      tilted: !flat,
    };
    await kv.set(PREFERENCES_KEY, preferences);
  },
};
