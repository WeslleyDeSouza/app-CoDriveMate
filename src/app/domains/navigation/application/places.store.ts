import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@core/i18n';
import { NavigationRepository } from '../domain/ports';
import { Place } from '../domain/route';
import {
  Favourite,
  NO_PLACES,
  SavedPlace,
  SavedPlaces,
  matching,
  offlineCoordinate,
  samePlace,
  searchText,
  toSaved,
  withRecent,
} from '../domain/saved-places';
import { NavigationStore } from './navigation.store';
import { OSM_SERVICE } from './tokens';

/** A saved place must not keep the driver waiting if its place is known anyway. */
const LOOKUP_MS = 5000;

/** Home, work and the last destinations. They stay on the device. */
@Injectable({ providedIn: 'root' })
export class PlacesStore {
  private readonly repository = inject(NavigationRepository);
  private readonly navigation = inject(NavigationStore);
  private readonly osm = inject(OSM_SERVICE);
  private readonly translate = inject(TranslateService);
  private readonly _places = signal<SavedPlaces>(NO_PLACES);
  private loaded?: Promise<void>;

  readonly places = this._places.asReadonly();

  load(): Promise<void> {
    this.loaded ??= this.repository
      .loadPlaces()
      .then((places) => this._places.set(places))
      .catch(() => undefined);
    return this.loaded;
  }

  /** Starts the way to a found place and remembers it. */
  async go(place: Place): Promise<boolean> {
    if (!(await this.navigation.navigateTo(place))) return false;
    const saved = toSaved(place);
    await this.change((places) => withRecent(places, this.keepOffline(places, saved)));
    void this.lookUpOffline(place, saved);
    return true;
  }

  /** Starts the way to a saved place, after looking it up again if needed. */
  async goSaved(saved: SavedPlace): Promise<boolean> {
    const { name, detail } = saved;
    if (saved.coordinate) return this.go({ name, detail, coordinate: saved.coordinate });
    const found = await this.lookUp(saved);
    // The name the user knows, not the one of this search.
    if (found) return this.go({ ...found, name, detail });
    return saved.offline
      ? this.navigation.navigateTo({ name, detail, coordinate: saved.offline })
      : false;
  }

  matching(text: string): SavedPlace[] {
    return matching(this._places(), text);
  }

  async setFavourite(kind: Favourite, place: Place | null): Promise<void> {
    const saved = place && toSaved(place);
    await this.change((places) => ({
      ...places,
      [kind]: saved && this.keepOffline(places, saved),
    }));
    if (place && saved) void this.lookUpOffline(place, saved);
  }

  forget(saved: SavedPlace): Promise<void> {
    return this.change((places) => ({
      ...places,
      recent: places.recent.filter((other) => !samePlace(other, saved)),
    }));
  }

  private async lookUp(saved: SavedPlace): Promise<Place | undefined> {
    const search = this.navigation.search(searchText(saved)).catch(() => []);
    if (!saved.offline) return (await search)[0];
    const waited = new Promise<Place[]>((resolve) => setTimeout(() => resolve([]), LOOKUP_MS));
    return (await Promise.race([search, waited]))[0];
  }

  /** Keeps what was already known when a place is saved again. */
  private keepOffline(places: SavedPlaces, saved: SavedPlace): SavedPlace {
    if (saved.coordinate) return saved;
    const known = [places.home, places.work, ...places.recent].find(
      (other) => other?.offline && samePlace(other, saved),
    );
    return known ? { ...saved, offline: known.offline } : saved;
  }

  /** Asks OpenStreetMap for a place whose coordinates may not be kept. */
  private async lookUpOffline(place: Place, saved: SavedPlace): Promise<void> {
    if (saved.coordinate) return;
    const found = await this.osm
      .search(searchText(saved), place.coordinate, this.translate.lang)
      .catch(() => []);
    const offline = offlineCoordinate(place, found);
    if (!offline) return;
    const add = (other: SavedPlace | null) =>
      other && samePlace(other, saved) && !other.coordinate ? { ...other, offline } : other;
    await this.change((places) => ({
      home: add(places.home),
      work: add(places.work),
      recent: places.recent.map((other) => add(other) ?? other),
    }));
  }

  private async change(update: (places: SavedPlaces) => SavedPlaces): Promise<void> {
    await this.load();
    const next = update(this._places());
    this._places.set(next);
    await this.repository.savePlaces(next).catch((e: unknown) => console.warn(e));
  }
}
