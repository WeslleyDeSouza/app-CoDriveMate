import { Coordinate, distanceM } from './geo';
import { Place } from './route';

/**
 * A destination the user went to before. Mapbox and Google do not allow to keep
 * what their search found, so those are kept without coordinates and looked up again;
 * without a network the place OpenStreetMap knows under the same name is used.
 */
export interface SavedPlace {
  readonly name: string;
  readonly detail: string;
  readonly coordinate: Coordinate | null;
  /** From OpenStreetMap, for the time without a network. */
  readonly offline?: Coordinate;
}

export type Favourite = 'home' | 'work';
export const FAVOURITES: readonly Favourite[] = ['home', 'work'];

export interface SavedPlaces {
  readonly home: SavedPlace | null;
  readonly work: SavedPlace | null;
  /** newest first */
  readonly recent: readonly SavedPlace[];
}

export const NO_PLACES: SavedPlaces = { home: null, work: null, recent: [] };
const MAX_RECENT = 8;
const SAME_PLACE_M = 60;
const SAME_TARGET_M = 150;

export function toSaved(place: Place): SavedPlace {
  const { name, detail, coordinate, source } = place;
  return { name, detail, coordinate: source && source !== 'osm' ? null : coordinate };
}

/** Where OpenStreetMap has the place, if it clearly is the same one. */
export function offlineCoordinate(place: Place, found: readonly Place[]): Coordinate | undefined {
  return found
    .map(({ coordinate }) => coordinate)
    .sort((a, b) => distanceM(a, place.coordinate) - distanceM(b, place.coordinate))
    .find((coordinate) => distanceM(coordinate, place.coordinate) < SAME_TARGET_M);
}

/** Saved places with all words of the text in their name or address. */
export function matching(places: SavedPlaces, text: string): SavedPlace[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const all = [places.home, places.work, ...places.recent].filter((place) => place !== null);
  return all.filter(
    (place, i) =>
      words.every((word) => searchText(place).toLowerCase().includes(word)) &&
      all.findIndex((other) => samePlace(other, place)) === i,
  );
}

export function samePlace(a: SavedPlace, b: SavedPlace): boolean {
  if (a.coordinate && b.coordinate) return distanceM(a.coordinate, b.coordinate) < SAME_PLACE_M;
  return a.name === b.name && a.detail === b.detail;
}

/** Whether a destination is the driver's home or workplace; null if neither. */
export function favouriteOf(
  places: SavedPlaces,
  { name, detail, coordinate }: Pick<Place, 'name' | 'detail' | 'coordinate'>,
): Favourite | null {
  const is = (saved: SavedPlace | null) =>
    !!saved && samePlace(saved, { name, detail, coordinate: saved.coordinate && coordinate });
  return FAVOURITES.find((kind) => is(places[kind])) ?? null;
}

export function withRecent(places: SavedPlaces, place: SavedPlace): SavedPlaces {
  const others = places.recent.filter((other) => !samePlace(other, place));
  return { ...places, recent: [place, ...others].slice(0, MAX_RECENT) };
}

/** Text to find a saved place again. */
export function searchText({ name, detail }: SavedPlace): string {
  return [name, detail].filter(Boolean).join(', ');
}
