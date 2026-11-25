import { Injectable, computed, inject, signal } from '@angular/core';
import { SpeechOutput } from '@core/device';
import { TranslateService } from '@core/i18n';
import { FuelStore } from '@domains/fuel';
import { SettingsStore } from '@domains/settings';
import { TelemetryStore } from '@domains/telemetry';
import {
  VehicleWarning,
  WarningLevel,
  WarningMonitor,
  WarningTile,
  vehicleWarnings,
} from '../domain/warnings';
import { DiagnosticsStore } from './diagnostics.store';

const TICK_MS = 1000;

/** Watches the car and warns. Runs from app start. */
@Injectable({ providedIn: 'root' })
export class WarningStore {
  private readonly telemetry = inject(TelemetryStore);
  private readonly diagnostics = inject(DiagnosticsStore);
  private readonly fuel = inject(FuelStore);
  private readonly speech = inject(SpeechOutput);
  private readonly translate = inject(TranslateService);
  private readonly settings = inject(SettingsStore).settings;
  private readonly monitor = new WarningMonitor();
  private readonly _active = signal<readonly VehicleWarning[]>([]);
  private readonly _shown = signal<VehicleWarning | null>(null);
  private timer?: ReturnType<typeof setInterval>;

  /** The warning card, null if there is none. */
  readonly shown = this._shown.asReadonly();
  /** How the tiles of the cockpit are coloured. */
  readonly levels = computed(() => {
    const levels: Partial<Record<WarningTile, WarningLevel>> = {};
    for (const { tile, level } of this._active()) if (tile) levels[tile] = level;
    return levels;
  });

  start(): void {
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
  }

  confirm(): void {
    const shown = this._shown();
    if (!shown) return;
    this.monitor.confirm(shown.id, Date.now());
    this.tick();
  }

  private tick(): void {
    const mode = this.telemetry.mode();
    const { rpm, coolantTemp, voltage } = this.telemetry.snapshot();
    const warnings = vehicleWarnings({
      connected: mode === 'obd' || mode === 'demo',
      rpm,
      coolantC: coolantTemp,
      voltage,
      rangeKm: this.fuel.rangeKm(),
      lamp: this.diagnostics.lamp(),
      codes: this.diagnostics.codes(),
    });
    const { active, shown } = this.monitor.next(warnings, Date.now());
    this._active.set(active);
    const before = this._shown();
    this._shown.set(shown);
    if (shown && shown.id !== before?.id) this.say(shown);
  }

  private say({ id }: VehicleWarning): void {
    const key = 'diagnostics.warning.' + id;
    const text = [key + '.title', key + '.say']
      .map((k) => this.translate.translate(k) ?? k)
      .join('. ');
    const { rate, warnings } = this.settings().voice;
    if (warnings) void this.speech.speak(text, this.translate.lang, rate, 'nav');
  }
}
