import { OfflineArea } from './offline-areas';
import { Coordinate } from './geo';
import { Place, ProviderId, Route } from './route';
import { MapKind } from './map-choice';
import { SavedPlaces } from './saved-places';
import { PlannedTrip } from './planned-trips';

export interface GeoPosition {
  readonly coordinate: Coordinate;
  /** direction of travel, null while standing */
  readonly heading: number | null;
  readonly accuracyM: number;
  /** km/h, if the device measures it */
  readonly speedKmh?: number | null;
}

/** Port: position of the device. */
export abstract class PositionSource {
  /** True if the position may be read without asking the user. */
  abstract granted(): Promise<boolean>;
  /** Starts updates, asking for permission if needed. Resolves with a stop function. */
  abstract watch(
    onPosition: (position: GeoPosition) => void,
    onError: () => void,
  ): Promise<() => void>;
  /** Whether updates go on while the app is not visible; nothing to do on the web. */
  abstract setBackground(message: string | null): Promise<void>;
}

/** Port: routes and places of one provider. */
export abstract class NavigationService {
  abstract readonly id: ProviderId;
  abstract route(from: Coordinate, to: Coordinate): Promise<Route>;
  abstract search(text: string, near: Coordinate | null, lang: string): Promise<Place[]>;
  /** Like `search`, for text that is still being typed. */
  abstract suggest(text: string, near: Coordinate | null, lang: string): Promise<Place[]>;
}

/** How the map moves with the car. */
export type FollowMode = 'heading' | 'north';
export type MapView = 'free' | FollowMode;

/** The view button goes round: free, behind the arrow, north up. */
export function nextMapView(view: MapView): MapView {
  return view === 'free' ? 'heading' : view === 'heading' ? 'north' : 'free';
}

export interface MapPreferences {
  /** zoom the user added to the automatic one */
  zoomOffset: number;
  /** used when the map follows; a freely moved map is not remembered */
  follow: FollowMode;
  tilted: boolean;
  /** trip card with arrival and remaining time only */
  etaFolded?: boolean;
}

export const DEFAULT_MAP_PREFERENCES: MapPreferences = {
  zoomOffset: 0,
  follow: 'heading',
  tilted: true,
};

/** Port: what the navigation remembers. */
export abstract class NavigationRepository {
  abstract loadPreferences(): Promise<MapPreferences>;
  abstract savePreferences(preferences: MapPreferences): Promise<void>;
  /** provider id -> day its quota ran out */
  abstract loadExhausted(): Promise<Record<string, string>>;
  abstract saveExhausted(entries: Record<string, string>): Promise<void>;
  abstract loadPlaces(): Promise<SavedPlaces>;
  abstract savePlaces(places: SavedPlaces): Promise<void>;
  /** Destinations saved for later, with what they are about. */
  abstract loadTrips(): Promise<readonly PlannedTrip[]>;
  abstract saveTrips(trips: readonly PlannedTrip[]): Promise<void>;
  /** Newest first. Belongs to this device, so it is not part of a backup. */
  abstract loadOfflineAreas(): Promise<readonly OfflineArea[]>;
  abstract saveOfflineAreas(areas: readonly OfflineArea[]): Promise<void>;
}

export interface MapCamera {
  readonly center: Coordinate;
  readonly zoom: number;
  readonly bearing: number;
  readonly pitch: number;
}

export interface MapEvents {
  /** The user moved the map; `by` tells how. */
  onUserMove(by: 'pan' | 'zoom' | 'rotate', camera: MapCamera): void;
  /** The map cannot be shown; `keyRejected` if the provider refused the key. */
  onFailure(keyRejected: boolean): void;
}

/**
 * Port: a drawn map. Sources and layers use the Mapbox style specification,
 * which the native SDK, Mapbox GL JS and MapLibre all understand, so the scene
 * is described once (application/map-scene.ts).
 */
export interface MapSurface {
  addSource(id: string, source: object): Promise<void>;
  setData(id: string, geojson: object): Promise<void>;
  addLayer(layer: object): Promise<void>;
  setVisible(layerId: string, visible: boolean): Promise<void>;
  /** Registers one of our icons as image `id`. */
  addIcon(id: string, icon: MapIcon): Promise<void>;
  setBuildings(visible: boolean): Promise<void>;
  moveTo(camera: MapCamera, durationMs: number): void;
  /** Loads what a camera would show, without moving. */
  preload(camera: MapCamera): void;
  /** Time of day of the Mapbox Standard style. */
  setLight(preset: MapLight): Promise<void>;
  camera(): MapCamera;
  destroy(): void;
}

export type MapIcon = 'arrow' | 'parking' | 'fuel' | 'warning';
export type MapLight = 'dawn' | 'day' | 'dusk' | 'night';

export interface MapSurfaceOptions {
  /** several maps may be open at once; 'main' if not given */
  readonly id?: string;
  readonly kind: MapKind;
  readonly dark: boolean;
  readonly token: string;
  readonly camera: MapCamera;
  /** overrides day and night from `dark` */
  readonly light?: MapLight;
  /** false: the user cannot move it */
  readonly interactive?: boolean;
}

/** Port: creates the map for a kind; resolves when its style is loaded. */
export abstract class MapSurfaceFactory {
  abstract create(
    container: HTMLElement,
    options: MapSurfaceOptions,
    events: MapEvents,
  ): Promise<MapSurface>;
}
