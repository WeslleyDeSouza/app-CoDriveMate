import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationStore, PositionStore, distanceM } from '@domains/navigation';
import { Routine, findRoutines, routineNow } from '../domain/routine';
import { LogbookStore } from './logbook.store';

const TICK_MS = 60_000;
const FIRST_TICK_MS = 5000;
/** Habits are worked out again after this long, or when drives were added. */
const RECOUNT_MS = 3_600_000;
/** The expected duration is asked again after this long. */
const ESTIMATE_MS = 300_000;

export interface RoutineSuggestion {
  readonly routine: Routine;
  /** expected duration with traffic; null while unknown */
  readonly minutes: number | null;
}

/**
 * Notices habits (e.g. weekdays 5-6 to the gym) and prepares the route: at the usual
 * place and time, the destination is suggested with the expected duration.
 * Everything is worked out on the device.
 */
@Injectable({ providedIn: 'root' })
export class RoutineStore {
  private readonly logbook = inject(LogbookStore);
  private readonly positions = inject(PositionStore);
  private readonly navigation = inject(NavigationStore);

  private readonly _suggestion = signal<RoutineSuggestion | null>(null);
  private routines: Routine[] = [];
  private counted = { at: 0, drives: -1 };
  private estimatedAt = 0;
  private readonly dismissed = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;

  /** What fits now; none while a route runs. */
  readonly suggestion = computed(() => (this.navigation.route() ? null : this._suggestion()));

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    setTimeout(() => void this.tick(), FIRST_TICK_MS);
  }

  /** Starts the route of the suggestion. */
  async go(): Promise<boolean> {
    const suggestion = this._suggestion();
    if (!suggestion) return false;
    this.dismiss();
    const { name, at } = suggestion.routine;
    return this.navigation.navigateTo({ name, detail: '', coordinate: at });
  }

  /** Not today. */
  dismiss(): void {
    const suggestion = this._suggestion();
    if (suggestion) this.dismissed.add(keyOf(suggestion.routine));
    this._suggestion.set(null);
  }

  /** Checks now, e.g. when a drive begins. */
  async tick(now = Date.now()): Promise<void> {
    if (this.navigation.route()) return;
    const here = this.positions.position()?.coordinate;
    if (!here) return this._suggestion.set(null);
    if (!this.logbook.loaded()) await this.logbook.load().catch(() => undefined);
    const drives = this.logbook.trips();
    if (drives.length !== this.counted.drives || now - this.counted.at > RECOUNT_MS) {
      this.routines = findRoutines(
        drives.map(({ startedAt, path, end, to }) => ({
          startedAt,
          from: path[0] ?? null,
          end,
          to,
        })),
        now,
        distanceM,
      );
      this.counted = { at: now, drives: drives.length };
    }
    const routine = routineNow(this.routines, here, now, distanceM);
    if (!routine || this.dismissed.has(keyOf(routine))) return this._suggestion.set(null);
    const shown = this._suggestion();
    const same = shown && keyOf(shown.routine) === keyOf(routine);
    if (same && now - this.estimatedAt < ESTIMATE_MS) return;
    if (!same) this._suggestion.set({ routine, minutes: null });
    this.estimatedAt = now;
    const place = { name: routine.name, detail: '', coordinate: routine.at };
    const estimate = await this.navigation.estimate(place);
    const current = this._suggestion();
    if (estimate && current && keyOf(current.routine) === keyOf(routine)) {
      this._suggestion.set({ routine, minutes: Math.max(1, Math.round(estimate.durationS / 60)) });
    }
  }
}

function keyOf({ name, earliest, from }: Routine): string {
  return `${name}|${earliest}|${from.join(',')}|${new Date().toDateString()}`;
}
