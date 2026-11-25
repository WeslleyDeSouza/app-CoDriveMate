import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { TelemetryStore } from '@domains/telemetry';
import { Coordinate, Polyline, pointAt } from '../domain/geo';
import { PositionSource } from '../domain/ports';

export interface VehiclePosition {
  readonly coordinate: Coordinate;
  readonly heading: number;
}

export type PositionStatus = 'off' | 'searching' | 'ok' | 'denied';

const DEMO_TICK_MS = 250;

/** Where the car is: from the device, or moved along a line during the demo drive. */
@Injectable({ providedIn: 'root' })
export class PositionStore {
  private readonly source = inject(PositionSource);
  private readonly telemetry = inject(TelemetryStore);

  private readonly device = signal<VehiclePosition | null>(null);
  private readonly demo = signal<VehiclePosition | null>(null);
  private readonly _speedKmh = signal<number | null>(null);
  private readonly _status = signal<PositionStatus>('off');
  private demoLine?: Polyline;
  private demoAlongM = 0;
  private watching = false;

  readonly status = this._status.asReadonly();
  /** Speed measured by the device, null if unknown. */
  readonly speedKmh = this._speedKmh.asReadonly();
  readonly isDemo = computed(() => this.telemetry.mode() === 'demo');
  readonly position = computed(() =>
    this.isDemo() ? (this.demo() ?? this.device()) : this.device(),
  );

  constructor() {
    effect((onCleanup) => {
      if (!this.isDemo()) {
        untracked(() => this.demo.set(null));
        return;
      }
      const timer = setInterval(() => this.demoStep(DEMO_TICK_MS / 1000), DEMO_TICK_MS);
      onCleanup(() => clearInterval(timer));
    });
  }

  /** Starts GPS; with `ask: false` only if the permission was already given. */
  async start(ask: boolean): Promise<void> {
    if (this.watching) return;
    this.watching = true;
    try {
      if (!ask && !(await this.source.granted())) {
        this.watching = false;
        return;
      }
      if (this._status() !== 'ok') this._status.set('searching');
      await this.source.watch(
        ({ coordinate, heading, speedKmh }) => {
          this._speedKmh.set(speedKmh ?? null);
          this._status.set('ok');
          this.device.update((last) => ({ coordinate, heading: heading ?? last?.heading ?? 0 }));
        },
        () => {
          if (!this.device()) this._status.set('searching');
        },
      );
    } catch {
      this.watching = false;
      this._status.set('denied');
    }
  }

  /** Keeps positions coming while the app is not visible; null ends that. */
  setBackground(message: string | null): void {
    void this.source
      .setBackground(message)
      .catch((error: unknown) => console.warn('Background location failed', error));
  }

  /** The line the demo drive follows. */
  driveDemoAlong(line: Polyline): void {
    this.demoLine = line;
    this.demoAlongM = 0;
    this.demoStep(0);
  }

  private demoStep(seconds: number): void {
    if (!this.demoLine) return;
    this.demoAlongM += (this.telemetry.snapshot().speed / 3.6) * seconds;
    if (this.demoAlongM > this.demoLine.lengthM) this.demoAlongM = 0;
    const { point, heading } = pointAt(this.demoLine, this.demoAlongM);
    this.demo.set({ coordinate: point, heading });
  }
}
