import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { HISTORY_STEP_MS, Sample, sampleOf, withSample } from '../domain/history';
import { TelemetryStore } from './telemetry.store';

/** The last two minutes of driving, for the chart. */
@Injectable({ providedIn: 'root' })
export class HistoryStore {
  private readonly telemetry = inject(TelemetryStore);
  private readonly _samples = signal<readonly Sample[]>([]);
  readonly samples = this._samples.asReadonly();

  constructor() {
    effect((onCleanup) => {
      const mode = this.telemetry.mode();
      if (mode !== 'obd' && mode !== 'demo') return;
      const timer = setInterval(() => untracked(() => this.add()), HISTORY_STEP_MS);
      onCleanup(() => clearInterval(timer));
    });
  }

  private add(): void {
    const sample = sampleOf(this.telemetry.snapshot(), this.telemetry.fuelRateLph());
    this._samples.update((samples) => withSample(samples, sample));
  }
}
