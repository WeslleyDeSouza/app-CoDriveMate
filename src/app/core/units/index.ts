import { Injectable, signal } from '@angular/core';
import { METRIC, Units } from '@shared/kernel/units';

/** The units to display; the settings set them. */
@Injectable({ providedIn: 'root' })
export class UnitsStore {
  private readonly _units = signal<Units>(METRIC);
  readonly units = this._units.asReadonly();

  set(units: Units): void {
    this._units.set(units);
  }
}
