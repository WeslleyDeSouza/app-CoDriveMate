import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Reminders, SpeechOutput } from '@core/device';
import { TranslateService } from '@core/i18n';
import { MapPinsStore, NavigationStore, PositionStore, distanceM } from '@domains/navigation';
import { SceneStore } from '@domains/scene3d';
import { SettingsStore } from '@domains/settings';
import { TelemetryStore } from '@domains/telemetry';
import { CarPark, CarParkSource } from '../domain/handover';
import {
  DriveEndDetector,
  ParkingRepository,
  ParkingSpot,
  REMIND_BEFORE_MS,
  dueReminder,
  parkAt,
  withMeter,
} from '../domain/parking';

export interface CarParkSearch {
  readonly state: 'idle' | 'searching' | 'done' | 'empty' | 'failed' | 'no_position';
  readonly parks: readonly (CarPark & { readonly distanceM: number })[];
}

const MAX_PARKS = 6;
const TICK_MS = 5000;
const PIN = 'parking';
const REMINDER_IDS = { soon: 7101, over: 7102 } as const;

/** Where the car stands, the meter and its reminders. Runs from app start. */
@Injectable({ providedIn: 'root' })
export class ParkingStore {
  private readonly repository = inject(ParkingRepository);
  private readonly positions = inject(PositionStore);
  private readonly navigation = inject(NavigationStore);
  private readonly pins = inject(MapPinsStore);
  private readonly scene = inject(SceneStore);
  private readonly telemetry = inject(TelemetryStore);
  private readonly settings = inject(SettingsStore).settings;
  private readonly reminders = inject(Reminders);
  private readonly speech = inject(SpeechOutput);
  private readonly translate = inject(TranslateService);

  private readonly _spot = signal<ParkingSpot | null>(null);
  private readonly _now = signal(Date.now());
  private readonly _alert = signal<'soon' | 'over' | null>(null);
  private readonly detector = new DriveEndDetector();
  private loaded?: Promise<void>;

  private readonly carParks = inject(CarParkSource);
  private readonly _search = signal<CarParkSearch>({ state: 'idle', parks: [] });

  readonly search = this._search.asReadonly();
  readonly spot = this._spot.asReadonly();
  readonly now = this._now.asReadonly();
  /** Reminder to show until it is confirmed. */
  readonly alert = this._alert.asReadonly();
  /** Reminders while the app is closed are not allowed or not possible. */
  readonly silent = signal(false);
  readonly minutesLeft = computed(() => {
    const until = this._spot()?.until;
    return until ? Math.ceil((until - this._now()) / 60_000) : null;
  });

  constructor() {
    effect(() => {
      const spot = this._spot();
      untracked(() =>
        this.pins.set(
          PIN,
          spot && {
            icon: 'parking',
            coordinate: spot.at,
            name: spot.street || this.t('parking.car'),
          },
        ),
      );
    });
  }

  /** Loads the spot and starts watching; safe to call repeatedly. */
  start(): Promise<void> {
    this.loaded ??= this.repository
      .load()
      .then((spot) => this._spot.set(spot ?? null))
      .catch((error: unknown) => console.warn('Loading the parking spot failed', error))
      .then(() => {
        this.tick();
        setInterval(() => this.tick(), TICK_MS);
      });
    return this.loaded;
  }

  /** "Parked here". False while the position is unknown. */
  async parkHere(): Promise<boolean> {
    await this.positions.start(true);
    return this.park(null);
  }

  async setMeter(minutes: number): Promise<void> {
    const spot = this._spot();
    if (!spot) return;
    const next = withMeter(spot, minutes, Date.now());
    this._alert.set(null);
    this._now.set(Date.now());
    await this.store(next);
    await this.reminders.cancel(Object.values(REMINDER_IDS));
    this.silent.set(!!next.until && !(await this.schedule(next.until)));
  }

  async setNote(note: string): Promise<void> {
    const spot = this._spot();
    if (spot) await this.store({ ...spot, note });
  }

  async clear(): Promise<void> {
    this._alert.set(null);
    await this.store(null);
    await this.reminders.cancel(Object.values(REMINDER_IDS));
  }

  confirmAlert(): void {
    this._alert.set(null);
  }

  showOnMap(): void {
    const spot = this._spot();
    if (spot) this.pins.show(spot.at);
  }

  /** Car parks at the destination, or around the car without a route. */
  async findCarParks(): Promise<void> {
    const at =
      this.navigation.destination()?.coordinate ?? this.positions.position()?.coordinate ?? null;
    if (!at) return this._search.set({ state: 'no_position', parks: [] });
    this._search.set({ state: 'searching', parks: [] });
    try {
      const parks = (await this.carParks.around(at))
        .map((park) => ({ ...park, distanceM: distanceM(at, park.at) }))
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, MAX_PARKS);
      this._search.set({ state: parks.length ? 'done' : 'empty', parks });
    } catch {
      this._search.set({ state: 'failed', parks: [] });
    }
  }

  guideTo({ name, address, at }: CarPark): Promise<boolean> {
    return this.navigation.navigateTo({
      name: name || this.t('parking.car_park'),
      detail: address,
      coordinate: at,
    });
  }

  async guideBack(): Promise<boolean> {
    const spot = this._spot();
    if (!spot) return false;
    const name = this.t('parking.car');
    return this.navigation.navigateTo({ name, detail: spot.street, coordinate: spot.at });
  }

  private tick(): void {
    const now = Date.now();
    this._now.set(now);
    this.watchDrive(now);
    const spot = this._spot();
    const due = spot && dueReminder(spot, now);
    if (!spot || !due) return;
    void this.store({ ...spot, reminded: [...spot.reminded, due] });
    this._alert.set(due);
    const { rate, infos } = this.settings().voice;
    if (!infos) return;
    const text = this.reminderText(due, this.minutesLeft() ?? 0);
    void this.speech.speak(text, this.translate.lang, rate, 'nav');
  }

  private watchDrive(now: number): void {
    const mode = this.telemetry.mode();
    const { speed, rpm } = this.telemetry.snapshot();
    // The demo drive parks nothing.
    if (mode === 'demo') return;
    const ended = this.detector.next({ now, speedKmh: speed, rpm, connected: mode === 'obd' });
    if (ended && this.settings().autoPark) void this.park(this._spot());
  }

  private async park(keepMeter: ParkingSpot | null): Promise<boolean> {
    const at = this.positions.position()?.coordinate;
    if (!at) return false;
    await this.store(parkAt(at, this.scene.street(), Date.now(), keepMeter));
    return true;
  }

  private async store(spot: ParkingSpot | null): Promise<void> {
    this._spot.set(spot);
    await this.repository
      .save(spot)
      .catch((error: unknown) => console.warn('Saving the parking spot failed', error));
  }

  private schedule(until: number): Promise<boolean> {
    const title = this.t('parking.title');
    const soon = until - REMIND_BEFORE_MS;
    const all = [
      { id: REMINDER_IDS.soon, at: new Date(soon), title, text: this.reminderText('soon', 10) },
      { id: REMINDER_IDS.over, at: new Date(until), title, text: this.reminderText('over', 0) },
    ];
    return this.reminders.schedule(all.filter(({ at }) => at.getTime() > Date.now()));
  }

  private reminderText(kind: 'soon' | 'over', minutes: number): string {
    return this.t('parking.remind.' + kind, { minutes });
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.translate(key, params) ?? key;
  }
}
