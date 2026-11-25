import { Injectable, computed, inject, signal } from '@angular/core';
import { TelemetryStore } from '@domains/telemetry';
import {
  DEFAULT_PLAN,
  DueLevel,
  ItemChanges,
  MaintenancePlan,
  MaintenanceRepository,
  afterDriving,
  dueDate,
  dueStatus,
  inspectionLevel,
  normalizePlan,
  usedShare,
  vignetteLevel,
  withDone,
  withItem,
  withNewItem,
  withoutItem,
  worstLevel,
} from '../domain/maintenance';

const TICK_MS = 1000;
const SAVE_S = 15;
const CLOCK_MS = 60_000;

export interface DueEntry {
  readonly id: string;
  /** '' = translated by id */
  readonly name: string;
  readonly level: DueLevel;
}

/** Service plan and odometer. Runs from app start. */
@Injectable({ providedIn: 'root' })
export class MaintenanceStore {
  private readonly repository = inject(MaintenanceRepository);
  private readonly telemetry = inject(TelemetryStore);

  private readonly _plan = signal<MaintenancePlan>(DEFAULT_PLAN);
  private readonly _loaded = signal(false);
  private readonly now = signal(Date.now());
  private readonly noticed = signal(false);
  private loading?: Promise<void>;
  private started?: Promise<void>;
  private lastTick = 0;
  private unsavedS = 0;

  readonly plan = this._plan.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly items = computed(() => {
    const { items, odometerKm } = this._plan();
    const now = this.now();
    return items.map((item) => {
      const status = dueStatus(item, odometerKm, now);
      return { item, status, dueDate: dueDate(item), used: usedShare(item, status, now) };
    });
  });
  readonly inspection = computed(() => inspectionLevel(this._plan().inspectionDate, this.now()));
  readonly vignette = computed(() => vignetteLevel(this._plan().vignetteYear, this.now()));
  private readonly entries = computed<DueEntry[]>(() => [
    ...this.items().map(({ item: { id, name }, status: { level } }) => ({ id, name, level })),
    { id: 'inspection', name: '', level: this.inspection() },
    { id: 'vignette', name: '', level: this.vignette() },
  ]);
  /** The worst state of all, e.g. for a badge. */
  readonly level = computed(() => worstLevel(this.entries().map(({ level }) => level)));
  /** What is due or soon due. */
  readonly due = computed(() =>
    this.entries().filter(({ level }) => level === 'soon' || level === 'overdue'),
  );
  /** What was due at app start; empty once confirmed. */
  readonly notice = computed(() => (this.noticed() ? this.due() : []));

  /** Loads the plan and starts counting; safe to call repeatedly. */
  start(): Promise<void> {
    this.started ??= this.load().then(() => {
      this.noticed.set(this.due().length > 0);
      this.lastTick = Date.now();
      setInterval(() => this.tick(), TICK_MS);
    });
    return this.started;
  }

  /** Loads once; a failed attempt may be repeated. */
  load(): Promise<void> {
    this.loading ??= this.repository
      .load()
      .then((plan) => {
        this.now.set(Date.now());
        this._plan.set(normalizePlan(plan));
        this._loaded.set(true);
      })
      .catch((error: unknown) => {
        this.loading = undefined;
        console.warn('Loading the maintenance plan failed', error);
      });
    return this.loading;
  }

  confirmNotice(): void {
    this.noticed.set(false);
  }

  setOdometer(odometerKm: number): Promise<void> {
    return this.change((plan) => ({ ...plan, odometerKm, odometerUpdatedAt: Date.now() }));
  }

  /** ISO date or '' */
  setInspection(inspectionDate: string): Promise<void> {
    return this.change((plan) => ({ ...plan, inspectionDate }));
  }

  setVignette(vignetteYear: number): Promise<void> {
    return this.change((plan) => ({ ...plan, vignetteYear }));
  }

  edit(id: string, changes: ItemChanges): Promise<void> {
    return this.change((plan) => withItem(plan, id, changes));
  }

  add(name: string): Promise<void> {
    return this.change((plan) => withNewItem(plan, name));
  }

  remove(id: string): Promise<void> {
    return this.change((plan) => withoutItem(plan, id));
  }

  /** Records that a job was done now, at the current odometer reading. */
  markDone(id: string): Promise<void> {
    return this.change((plan) => withDone(plan, id, Date.now()));
  }

  private async change(update: (plan: MaintenancePlan) => MaintenancePlan): Promise<void> {
    await this.load();
    // Never overwrite a stored plan that could not be read.
    if (!this._loaded()) return;
    this.now.set(Date.now());
    this._plan.update(update);
    await this.save();
  }

  private tick(): void {
    const now = Date.now();
    // In the background timers are slowed down; a longer gap is not driven through.
    const seconds = Math.min(5, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;
    if (Math.abs(now - this.now()) >= CLOCK_MS) this.now.set(now);
    if (!this._loaded()) return;
    const driving = this.telemetry.mode() === 'obd';
    if (driving) {
      const plan = this._plan();
      const next = afterDriving(plan, this.telemetry.snapshot().speed, seconds);
      if (next !== plan) {
        this._plan.set(next);
        this.unsavedS += seconds;
      }
    }
    if (this.unsavedS >= SAVE_S || (!driving && this.unsavedS > 0)) void this.save();
  }

  private save(): Promise<void> {
    this.unsavedS = 0;
    return this.repository
      .save(this._plan())
      .catch((error: unknown) => console.warn('Saving the maintenance plan failed', error));
  }
}
