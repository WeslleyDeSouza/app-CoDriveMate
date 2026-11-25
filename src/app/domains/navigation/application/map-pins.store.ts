import { Injectable, computed, signal } from '@angular/core';
import { Coordinate } from '../domain/geo';
import { MapIcon } from '../domain/ports';

export interface MapPin {
  readonly id: string;
  readonly coordinate: Coordinate;
  readonly name: string;
  readonly icon: Exclude<MapIcon, 'arrow'>;
}

/** Places other domains show on the map, like the parked car. */
@Injectable({ providedIn: 'root' })
export class MapPinsStore {
  private readonly _pins = signal<ReadonlyMap<string, MapPin>>(new Map());
  private readonly _focus = signal<{ readonly coordinate: Coordinate } | null>(null);

  private readonly _track = signal<readonly Coordinate[] | null>(null);
  /** A drive to show as a line. */
  readonly track = this._track.asReadonly();
  readonly pins = computed(() => [...this._pins().values()]);
  /** The place the map was asked to show last. */
  readonly focus = this._focus.asReadonly();

  set(id: string, pin: Omit<MapPin, 'id'> | null): void {
    const pins = new Map(this._pins());
    if (pin) pins.set(id, { id, ...pin });
    else pins.delete(id);
    this._pins.set(pins);
  }

  showTrack(points: readonly Coordinate[] | null): void {
    this._track.set(points);
  }

  show(coordinate: Coordinate): void {
    this._focus.set({ coordinate });
  }
}
