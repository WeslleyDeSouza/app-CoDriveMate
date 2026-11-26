import { Coordinate, distanceM, pointAt, snap } from './geo';
import { Maneuver, Route, RouteStep } from './route';

export interface Progress {
  readonly alongM: number;
  readonly offRouteM: number;
  readonly remainingM: number;
  readonly remainingS: number;
  readonly stepIndex: number;
  readonly next: RouteStep;
  readonly then: RouteStep | null;
  /** metres to the next manoeuvre */
  readonly distanceM: number;
  readonly street: string;
  readonly arrived: boolean;
}

const ARRIVAL_M = 25;
const SEARCH_BACK_M = 100;
const SEARCH_AHEAD_M = 1500;
/** Beyond this distance from the expected stretch the whole route is searched. */
const LOST_M = 60;

export function progressOn(route: Route, position: Coordinate, previousM?: number): Progress {
  let at =
    previousM === undefined
      ? snap(route.line, position)
      : snap(route.line, position, {
          fromM: previousM - SEARCH_BACK_M,
          toM: previousM + SEARCH_AHEAD_M,
        });
  if (at.offsetM > LOST_M && previousM !== undefined) at = snap(route.line, position);

  const remainingM = Math.max(0, route.line.lengthM - at.alongM);
  let stepIndex = route.steps.findIndex((step) => step.alongM > at.alongM + 8);
  if (stepIndex < 0) stepIndex = route.steps.length - 1;
  const next = route.steps[stepIndex];
  return {
    alongM: at.alongM,
    offRouteM: at.offsetM,
    remainingM,
    remainingS: route.line.lengthM ? (route.durationS * remainingM) / route.line.lengthM : 0,
    stepIndex,
    next,
    then: route.steps[stepIndex + 1] ?? null,
    distanceM: Math.max(0, next.alongM - at.alongM),
    street: route.steps[stepIndex - 1]?.street ?? '',
    arrived: remainingM < ARRIVAL_M && at.offsetM < LOST_M,
  };
}

/** Announcement distances in metres, nearest first. */
const THRESHOLDS = [60, 300, 800];

/** Nearer to the threshold than this share, its round figure is said. */
const ROUND_SHARE = 0.85;
/** Positions come once a second, so a manoeuvre is passed by some metres. */
const PASSED_M = 15;

export interface Announcement {
  readonly immediate: boolean;
  /** metres to say */
  readonly spokenM: number;
}

/** A fixed figure where it is true, so that the sentence is known beforehand. */
function announcement(stage: number, distanceM: number): Announcement {
  const spokenM =
    distanceM >= stage * ROUND_SHARE ? stage : Math.max(50, Math.round(distanceM / 50) * 50);
  return { immediate: stage === THRESHOLDS[0], spokenM };
}

/** What will probably be announced for the next manoeuvres, in order. */
export function announcementsAhead(
  route: Route,
  { stepIndex, alongM }: Pick<Progress, 'stepIndex' | 'alongM'>,
  manoeuvres: number,
): (Announcement & { readonly step: RouteStep })[] {
  return route.steps.slice(stepIndex, stepIndex + manoeuvres).flatMap((step, i) => {
    const before = i ? route.steps[stepIndex + i - 1].alongM + PASSED_M : alongM;
    const distanceM = step.alongM - before;
    const first = THRESHOLDS.find((threshold) => distanceM <= threshold);
    const later = THRESHOLDS.filter((threshold) => threshold < (first ?? Infinity)).reverse();
    return [
      ...(first === undefined ? [] : [announcement(first, distanceM)]),
      ...later.map((threshold) => announcement(threshold, threshold)),
    ].map((one) => ({ ...one, step }));
  });
}

/** Two manoeuvres of the same kind this close together are one and the same. */
const SAME_MANOEUVRE_M = 40;
const KEPT_MANOEUVRES = 50;

interface Announced {
  readonly at: Coordinate;
  readonly kind: string;
  stage: number;
}

/**
 * Decides when a manoeuvre is announced; every distance is announced once.
 * A manoeuvre is known by its place, not by its step number: a new route to the
 * same destination (rerouting, traffic check) keeps what was said already.
 */
export class AnnouncementPlan {
  private done: Announced[] = [];

  /** The distance stage to announce now, or null. */
  next(progress: Progress, route: Route): Announcement | null {
    const stage = THRESHOLDS.find((t) => progress.distanceM <= t);
    if (stage === undefined) return null;
    const { type, modifier, exit } = progress.next.maneuver;
    const kind = `${type}|${modifier}|${exit ?? ''}`;
    const at = pointAt(route.line, progress.next.alongM).point;
    const known = this.done.find(
      (one) => one.kind === kind && distanceM(one.at, at) < SAME_MANOEUVRE_M,
    );
    if (known && known.stage <= stage) return null;
    if (known) known.stage = stage;
    else this.done = [...this.done, { at, kind, stage }].slice(-KEPT_MANOEUVRES);
    return announcement(stage, progress.distanceM);
  }
}

const OFF_ROUTE_M = 60;
const OFF_ROUTE_MS = 5000;
const REROUTE_PAUSE_MS = 15000;

/** Asks for a new route after some seconds away from the line, not at every GPS outlier. */
export class OffRouteDetector {
  private since = 0;
  private lastReroute = -Infinity;

  shouldReroute(offRouteM: number, now: number): boolean {
    if (offRouteM <= OFF_ROUTE_M) {
      this.since = 0;
      return false;
    }
    if (!this.since) this.since = now;
    if (now - this.since <= OFF_ROUTE_MS || now - this.lastReroute <= REROUTE_PAUSE_MS)
      return false;
    this.lastReroute = now;
    this.since = 0;
    return true;
  }
}

const ICONS: Record<string, string> = {
  left: 'corner-up-left',
  right: 'corner-up-right',
  'slight left': 'arrow-up-left',
  'slight right': 'arrow-up-right',
  'sharp left': 'arrow-back-up',
  'sharp right': 'arrow-forward-up',
  uturn: 'arrow-back-up',
};

export function maneuverIcon(maneuver: Maneuver): string {
  if (maneuver.type === 'arrive') return 'flag';
  if (isRoundabout(maneuver)) return 'rotate-clockwise-2';
  return ICONS[maneuver.modifier] ?? 'arrow-up';
}

function isRoundabout(maneuver: Maneuver): boolean {
  return maneuver.type === 'roundabout' || maneuver.type === 'rotary';
}

/** Translation key (below `navigation.`) for a manoeuvre. */
export function maneuverKey(maneuver: Maneuver): string {
  const side = maneuver.modifier.replace(' ', '_') || 'straight';
  switch (maneuver.type) {
    case 'depart':
    case 'arrive':
    case 'merge':
      return 'do.' + maneuver.type;
    case 'on ramp':
      return 'do.on_ramp';
    case 'off ramp':
      return 'do.off_ramp';
    case 'roundabout':
    case 'rotary':
      return maneuver.exit ? 'do.roundabout_exit' : 'do.roundabout';
    case 'fork':
      return 'do.keep_' + keepSide(side);
    case 'continue':
    case 'new name':
      return side === 'uturn' ? 'do.uturn' : 'do.keep_' + keepSide(side);
    default:
      return 'do.' + side;
  }
}

function keepSide(side: string): string {
  return side.endsWith('left') ? 'left' : side.endsWith('right') ? 'right' : 'straight';
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
