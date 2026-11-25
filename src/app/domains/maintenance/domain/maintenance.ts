/** One recurring job, due by distance, by time, or whichever comes first. */
export interface MaintenanceItem {
  id: string;
  /** '' = the translated name of a standard job */
  name: string;
  icon: string;
  /** 0 = no distance interval */
  intervalKm: number;
  /** 0 = no time interval */
  intervalMonths: number;
  lastKm: number | null;
  /** timestamp in ms */
  lastDate: number | null;
}

export interface MaintenancePlan {
  odometerKm: number | null;
  /** when the odometer was last entered, ms */
  odometerUpdatedAt: number;
  /** next vehicle inspection (MFK), ISO date or '' */
  inspectionDate: string;
  /** year of the motorway vignette on the car, 0 = none */
  vignetteYear: number;
  items: MaintenanceItem[];
}

const OWN_ICON = 'ti-tool';

/** Names the standard jobs were stored with before they were translated. */
const OLD_NAMES: ReadonlyMap<string, string> = new Map([
  ['service', 'Service'],
  ['oil', 'Ölwechsel'],
  ['brake', 'Bremsflüssigkeit'],
  ['plugs', 'Zündkerzen'],
  ['belt', 'Zahnriemen'],
]);

export const DEFAULT_PLAN: MaintenancePlan = {
  odometerKm: null,
  odometerUpdatedAt: 0,
  inspectionDate: '',
  vignetteYear: 0,
  items: [
    newItem('service', '', 'ti-tool', 20000, 12),
    newItem('oil', '', 'ti-droplet', 15000, 12),
    newItem('brake', '', 'ti-disc', 0, 24),
    newItem('plugs', '', 'ti-bolt', 60000, 0),
    newItem('belt', '', 'ti-settings-cog', 120000, 120),
  ],
};

function newItem(
  id: string,
  name: string,
  icon = OWN_ICON,
  intervalKm = 0,
  intervalMonths = 0,
): MaintenanceItem {
  return { id, name, icon, intervalKm, intervalMonths, lastKm: null, lastDate: null };
}

export function isStandardItem(id: string): boolean {
  return OLD_NAMES.has(id);
}

function ownName(id: string, name: string | undefined): string {
  if (isStandardItem(id)) return name === OLD_NAMES.get(id) ? '' : (name ?? '');
  return name || id;
}

/** Any stored plan in today's shape. */
export function normalizePlan(stored: Partial<MaintenancePlan> | undefined): MaintenancePlan {
  return {
    ...DEFAULT_PLAN,
    ...stored,
    items: stored?.items?.length
      ? stored.items.map((item) => ({
          ...newItem(item.id, ''),
          ...item,
          name: ownName(item.id, item.name),
        }))
      : DEFAULT_PLAN.items,
  };
}

export type DueLevel = 'unknown' | 'ok' | 'soon' | 'overdue';

export interface DueStatus {
  /** km until due (negative = overdue), null if not tracked by distance */
  remainingKm: number | null;
  /** days until due (negative = overdue), null if not tracked by time */
  remainingDays: number | null;
  level: DueLevel;
}

const DAY_MS = 86_400_000;
const SOON_KM = 1000;
const SOON_DAYS = 30;
const INSPECTION_SOON_DAYS = 60;

function addMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() + months);
  return date.getTime();
}

/** When an item is due by time, null if it is not tracked by time. */
export function dueDate({ intervalMonths, lastDate }: MaintenanceItem): number | null {
  return intervalMonths && lastDate !== null ? addMonths(lastDate, intervalMonths) : null;
}

/** When an item is due, given the current odometer reading and date. */
export function dueStatus(
  item: MaintenanceItem,
  odometerKm: number | null,
  now: number,
): DueStatus {
  const remainingKm =
    item.intervalKm && item.lastKm !== null && odometerKm !== null
      ? item.lastKm + item.intervalKm - odometerKm
      : null;
  const due = dueDate(item);
  const remainingDays = due === null ? null : Math.round((due - now) / DAY_MS);

  let level: DueLevel = 'ok';
  if (remainingKm === null && remainingDays === null) level = 'unknown';
  else if (
    (remainingKm !== null && remainingKm <= 0) ||
    (remainingDays !== null && remainingDays <= 0)
  )
    level = 'overdue';
  else if (
    (remainingKm !== null && remainingKm < SOON_KM) ||
    (remainingDays !== null && remainingDays < SOON_DAYS)
  )
    level = 'soon';

  return { remainingKm, remainingDays, level };
}

/** How much of the interval is used up, 0 to 1. */
export function usedShare(item: MaintenanceItem, status: DueStatus, now: number): number {
  const due = dueDate(item);
  const byKm = status.remainingKm === null ? 0 : 1 - status.remainingKm / item.intervalKm;
  const byTime =
    due === null || item.lastDate === null ? 0 : (now - item.lastDate) / (due - item.lastDate);
  return Math.min(1, Math.max(0, byKm, byTime));
}

/** The vehicle inspection (MFK) may still be done on its date. */
export function inspectionLevel(isoDate: string, now: number): DueLevel {
  const due = fromIsoDate(isoDate);
  if (due === null) return 'unknown';
  const days = Math.round((due - new Date(now).setHours(0, 0, 0, 0)) / DAY_MS);
  if (days < 0) return 'overdue';
  return days < INSPECTION_SOON_DAYS ? 'soon' : 'ok';
}

/** The Swiss vignette is valid until 31 January of the following year. */
export function vignetteLevel(year: number, now: number): DueLevel {
  if (!year) return 'unknown';
  if (now >= new Date(year + 1, 1, 1).getTime()) return 'overdue';
  return now >= new Date(year, 11, 1).getTime() ? 'soon' : 'ok';
}

const LEVELS: readonly DueLevel[] = ['unknown', 'ok', 'soon', 'overdue'];

export function worstLevel(levels: readonly DueLevel[]): DueLevel {
  return LEVELS[Math.max(0, ...levels.map((level) => LEVELS.indexOf(level)))];
}

/** Local date as YYYY-MM-DD. */
export function toIsoDate(timestamp: number | null): string {
  if (timestamp === null) return '';
  const date = new Date(timestamp);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** Start of that local day, null if it is no plausible date. */
export function fromIsoDate(iso: string): number | null {
  const parts = /^(\d{4})-(\d\d)-(\d\d)$/.exec(iso);
  if (!parts || Number(parts[1]) < 1950) return null;
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])).getTime();
}

const STANDING_KMH = 1;

/** Counts a moment of driving on the odometer. */
export function afterDriving(
  plan: MaintenancePlan,
  speedKmh: number,
  seconds: number,
): MaintenancePlan {
  if (plan.odometerKm === null || speedKmh <= STANDING_KMH) return plan;
  return { ...plan, odometerKm: plan.odometerKm + (speedKmh * seconds) / 3600 };
}

export type ItemChanges = Partial<Omit<MaintenanceItem, 'id'>>;

export function withItem(plan: MaintenancePlan, id: string, changes: ItemChanges): MaintenancePlan {
  return {
    ...plan,
    items: plan.items.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...changes };
      // Only a standard job has another name to fall back to.
      return next.name || isStandardItem(id) ? next : { ...next, name: item.name };
    }),
  };
}

export function withDone(plan: MaintenancePlan, id: string, now: number): MaintenancePlan {
  const lastKm = plan.odometerKm === null ? null : Math.round(plan.odometerKm);
  return withItem(plan, id, { lastKm, lastDate: now });
}

export function withNewItem(plan: MaintenancePlan, name: string): MaintenancePlan {
  const ids = new Set(plan.items.map((item) => item.id));
  let number = 1;
  while (ids.has('own-' + number)) number++;
  return { ...plan, items: [...plan.items, newItem('own-' + number, name)] };
}

/** Removes an own job; the standard jobs stay. */
export function withoutItem(plan: MaintenancePlan, id: string): MaintenancePlan {
  if (isStandardItem(id)) return plan;
  return { ...plan, items: plan.items.filter((item) => item.id !== id) };
}

/** Maintenance data of the prototype (localStorage `pd_maint`). */
export interface LegacyMaintenance {
  km?: number | null;
  kmT?: number;
  mfk?: string;
  vig?: number;
  items?: {
    id: string;
    n?: string;
    ic?: string;
    km?: number;
    mo?: number;
    lastKm?: number | null;
    lastD?: number | null;
  }[];
}

export function planFromLegacy(legacy: LegacyMaintenance): MaintenancePlan {
  return {
    odometerKm: legacy.km ?? null,
    odometerUpdatedAt: legacy.kmT ?? 0,
    inspectionDate: legacy.mfk ?? '',
    vignetteYear: legacy.vig ?? 0,
    items: legacy.items?.length
      ? legacy.items.map((old) => ({
          id: old.id,
          name: ownName(old.id, old.n),
          icon: old.ic ?? OWN_ICON,
          intervalKm: old.km ?? 0,
          intervalMonths: old.mo ?? 0,
          lastKm: old.lastKm ?? null,
          lastDate: old.lastD ?? null,
        }))
      : DEFAULT_PLAN.items,
  };
}

/** Port: where the maintenance plan is kept. */
export abstract class MaintenanceRepository {
  abstract load(): Promise<Partial<MaintenancePlan> | undefined>;
  abstract save(plan: MaintenancePlan): Promise<void>;
}
