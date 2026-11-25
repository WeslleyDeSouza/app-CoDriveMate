import { Injectable, computed, inject, signal } from '@angular/core';
import { SpeechOutput } from '@core/device';
import { TranslateService } from '@core/i18n';
import { DiagnosticsStore } from '@domains/diagnostics';
import { NavigationStore } from '@domains/navigation';
import { RoadStore } from '@domains/road';
import { SceneStore } from '@domains/scene3d';
import { SettingsStore, aiAvailable } from '@domains/settings';
import { TelemetryStore } from '@domains/telemetry';
import {
  CarSnapshot,
  ChatError,
  ChatFailure,
  ChatMessage,
  ChatModel,
  MAX_HISTORY,
  assistantPrompt,
  questionText,
  spokenText,
} from '../domain/copilot';

export interface ChatLine {
  readonly id: number;
  readonly from: 'user' | 'assistant';
  readonly text: string;
}

const MAX_LINES = 60;

/** Questions about the car. The chat lives as long as the app is open. */
@Injectable({ providedIn: 'root' })
export class CopilotStore {
  private readonly model = inject(ChatModel);
  private readonly settings = inject(SettingsStore).settings;
  private readonly telemetry = inject(TelemetryStore);
  private readonly navigation = inject(NavigationStore);
  private readonly scene = inject(SceneStore);
  private readonly diagnostics = inject(DiagnosticsStore);
  private readonly road = inject(RoadStore);
  private readonly speech = inject(SpeechOutput);
  private readonly translate = inject(TranslateService);

  private readonly _lines = signal<readonly ChatLine[]>([]);
  private readonly _busy = signal(false);
  private readonly _failure = signal<ChatFailure | null>(null);
  private history: ChatMessage[] = [];
  private nextId = 0;

  readonly lines = this._lines.asReadonly();
  readonly busy = this._busy.asReadonly();
  readonly failure = this._failure.asReadonly();
  /** A key is entered, or a proxy has one. */
  readonly available = computed(() => aiAvailable(this.settings()));

  async ask(question: string): Promise<void> {
    const text = question.trim();
    if (!text || this._busy()) return;
    this._failure.set(null);
    if (!this.available()) return this._failure.set('key');
    this.add('user', text);
    this._busy.set(true);
    try {
      const snapshot = this.snapshot();
      const answer = await this.model.ask({
        system: assistantPrompt(snapshot.vehicle, this.translate.lang),
        messages: [...this.history, { role: 'user', content: questionText(text, snapshot) }],
      });
      this.add('assistant', answer);
      const turn: ChatMessage[] = [
        { role: 'user', content: text },
        { role: 'assistant', content: answer },
      ];
      this.history = [...this.history, ...turn].slice(-MAX_HISTORY);
      const { readAnswers, rate } = this.settings().voice;
      if (readAnswers) {
        void this.speech.stop('answer');
        void this.speech.speak(spokenText(answer), this.translate.lang, rate, 'answer');
      }
    } catch (error) {
      this._failure.set(error instanceof ChatError ? error.reason : 'other');
      if (!(error instanceof ChatError)) console.warn('Copilot failed', error);
    } finally {
      this._busy.set(false);
    }
  }

  /** Adds a line of the conversation mode. */
  add(from: ChatLine['from'], text: string): void {
    const line = { id: this.nextId++, from, text };
    this._lines.update((lines) => [...lines, line].slice(-MAX_LINES));
  }

  clear(): void {
    this._lines.set([]);
    this._failure.set(null);
    this.history = [];
    void this.speech.stop('answer');
  }

  private snapshot(): CarSnapshot {
    const { name, fuelType, displacementL } = this.settings().vehicle;
    const mode = this.telemetry.mode();
    const v = this.telemetry.snapshot();
    const route = this.navigation.route();
    const progress = this.navigation.progress();
    const remainingS = progress?.remainingS ?? route?.durationS ?? 0;
    const destination = this.navigation.destination();
    return {
      vehicle: `${name}, ${fuelType} ${displacementL} l`,
      source: mode === 'obd' || mode === 'demo' ? mode : 'none',
      live: {
        speed_kmh: v.speed,
        rpm: v.rpm,
        coolant_c: v.coolantTemp,
        intake_air_c: v.intakeTemp,
        throttle_pct: v.throttle,
        load_pct: v.load,
        manifold_kpa: v.manifoldPressure,
        air_mass_gs: v.massAirFlow,
        timing_advance_deg: v.timingAdvance,
        fuel_trim_short_pct: v.shortFuelTrim,
        fuel_trim_long_pct: v.longFuelTrim,
        oxygen_v: v.oxygenVoltage,
        battery_v: v.voltage,
        tank_pct: v.fuelLevel,
        consumption_lh: this.telemetry.fuelRateLph(),
        consumption_l100: this.telemetry.consumptionPer100Km(),
      },
      street: this.scene.street(),
      codes: this.diagnostics.readAt() === null ? null : this.diagnostics.codes(),
      lamp: this.diagnostics.lamp(),
      limitKmh: this.road.limitKmh(),
      traffic: this.road
        .incidents()
        .slice(0, 6)
        .map(
          ({ kind, text, distanceM }) => `${kind}, ${(distanceM / 1000).toFixed(1)} km: ${text}`,
        ),
      destination:
        destination && route
          ? {
              name: destination.name,
              nextManeuverM: progress?.distanceM ?? null,
              arrival: new Date(Date.now() + remainingS * 1000).toTimeString().slice(0, 5),
              remainingKm: (progress?.remainingM ?? route.line.lengthM) / 1000,
            }
          : null,
    };
  }
}
