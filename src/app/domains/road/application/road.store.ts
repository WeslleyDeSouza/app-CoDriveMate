import { Injectable, computed, inject, signal } from '@angular/core';
import { SpeechOutput } from '@core/device';
import { TranslateService } from '@core/i18n';
import { UnitsStore } from '@core/units';
import { MapPinsStore, PositionStore } from '@domains/navigation';
import { SettingsStore } from '@domains/settings';
import { TelemetryStore } from '@domains/telemetry';
import { formatDistanceIn } from '@shared/kernel/units';
import {
  HazardAhead,
  LonLat,
  RoadData,
  RoadSource,
  hazardAhead,
  limitAt,
  mergeRoads,
  metresBetween,
  pointAhead,
  roadCell,
} from '../domain/road';
import { Incident, TrafficSource, isUrgent } from '../domain/traffic';

const TICK_MS = 1000;
const RETRY_MS = 30_000;
const TRAFFIC_MS = 120_000;
const TRAFFIC_MOVED_M = 5000;
const MAX_PINS = 30;
/** The next cell is loaded before the car gets there. */
const LOOK_AHEAD_M = 900;
const KEPT_CELLS = 4;
const PIN = 'traffic-';

export interface IncidentNear extends Incident {
  readonly distanceM: number;
}

/** Speed limit, fixed hazards and traffic messages. Runs from app start. */
@Injectable({ providedIn: 'root' })
export class RoadStore {
  private readonly source = inject(RoadSource);
  private readonly traffic = inject(TrafficSource);
  private readonly positions = inject(PositionStore);
  private readonly telemetry = inject(TelemetryStore);
  private readonly settings = inject(SettingsStore).settings;
  private readonly pins = inject(MapPinsStore);
  private readonly speech = inject(SpeechOutput);
  private readonly translate = inject(TranslateService);
  private readonly units = inject(UnitsStore).units;

  private readonly cells = signal<ReadonlyMap<string, RoadData>>(new Map());
  private readonly data = computed(() =>
    this.cells().size ? mergeRoads([...this.cells().values()]) : null,
  );
  private readonly _hazard = signal<HazardAhead | null>(null);
  private readonly _incidents = signal<readonly IncidentNear[]>([]);
  private retryAt = 0;
  private loading = false;
  private trafficAt: LonLat | null = null;
  private trafficTime = 0;
  private readonly said = new Set<string>();
  private readonly seen = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;

  /** km/h, null if unknown */
  readonly limitKmh = computed(() => {
    const position = this.positions.position();
    const data = this.data();
    if (!position || !data) return null;
    return limitAt(data.roads, position.coordinate, position.heading, this.speed() > 8);
  });
  /** The hazard the car comes to, null if there is none. */
  readonly hazard = this._hazard.asReadonly();
  /** Messages nearby, the nearest first. */
  readonly incidents = this._incidents.asReadonly();

  start(): void {
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
  }

  private speed(): number {
    const mode = this.telemetry.mode();
    if (mode === 'obd' || mode === 'demo') return this.telemetry.snapshot().speed;
    return this.positions.speedKmh() ?? 0;
  }

  private tick(): void {
    const position = this.positions.position();
    if (!position) return;
    const { coordinate, heading } = position;
    const ahead = pointAhead(coordinate, heading, this.speed() > 20 ? LOOK_AHEAD_M : 0);
    void this.loadCells([roadCell(coordinate), roadCell(ahead)]);
    if (!document.hidden) void this.loadTraffic(coordinate);
    const data = this.data();
    const hazard =
      data && this.settings().hazardHints
        ? hazardAhead(data.hazards, coordinate, heading, this.speed(), new Date())
        : null;
    this._hazard.set(hazard);
    if (hazard && !this.said.has(hazard.hazard.id)) {
      this.said.add(hazard.hazard.id);
      this.say('road.say.hazard', {
        hazard: this.t('road.hazard.' + hazard.hazard.kind),
        distance: formatDistanceIn(hazard.distanceM, this.units()),
      });
    }
  }

  /** What is known stays until the next cell is there. */
  private async loadCells(wanted: readonly LonLat[]): Promise<void> {
    if (this.loading || Date.now() < this.retryAt) return;
    const missing = wanted.find((cell) => !this.cells().has(cell.join(',')));
    if (!missing) return;
    this.loading = true;
    try {
      const data = await this.source.load(missing);
      if (!data) {
        this.retryAt = Date.now() + RETRY_MS;
        return;
      }
      const all = [...this.cells(), [missing.join(','), data] as const];
      this.cells.set(new Map(all.slice(-KEPT_CELLS)));
    } finally {
      this.loading = false;
    }
  }

  private async loadTraffic(at: LonLat): Promise<void> {
    const { keys, map } = this.settings();
    if (!keys.tomtom && !(map.swissTrafficReports && map.swissTrafficUrl)) return;
    const moved = this.trafficAt ? metresBetween(this.trafficAt, at) > TRAFFIC_MOVED_M : true;
    if (!moved && Date.now() - this.trafficTime < TRAFFIC_MS) return;
    this.trafficAt = at;
    this.trafficTime = Date.now();
    const incidents = await this.traffic.around(at);
    if (!incidents) return;
    const near = incidents
      .map((incident) => ({ ...incident, distanceM: metresBetween(at, incident.at) }))
      .sort((a, b) => a.distanceM - b.distanceM);
    this._incidents.set(near);
    for (let i = 0; i < MAX_PINS; i++) {
      const incident = near[i];
      this.pins.set(
        PIN + i,
        incident ? { icon: 'warning', name: incident.text, coordinate: incident.at } : null,
      );
    }
    for (const incident of near) {
      if (this.seen.has(incident.id)) continue;
      this.seen.add(incident.id);
      if (!isUrgent(incident, incident.distanceM)) continue;
      this.say('road.say.traffic', {
        kind: this.t('road.traffic.' + incident.kind),
        distance: formatDistanceIn(incident.distanceM, this.units()),
      });
    }
  }

  private say(key: string, params: Record<string, unknown>): void {
    const { navigation, rate } = this.settings().voice;
    if (navigation) void this.speech.speak(this.t(key, params), this.translate.lang, rate, 'nav');
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.translate(key, params) ?? key;
  }
}
