import { Injectable, signal } from '@angular/core';

/** Asks all domains to try paused services again. */
@Injectable({ providedIn: 'root' })
export class ServiceReset {
  private readonly _count = signal(0);
  /** Raised by every reset. */
  readonly count = this._count.asReadonly();

  reset(): void {
    this._count.update((count) => count + 1);
  }
}
