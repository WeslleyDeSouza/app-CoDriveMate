import { Coordinate, Polyline, bearing, distanceM, move, pointAt, snap } from './geo';
import { NearRoad, matchRoad } from './road-match';

/** What the device says about where it is. */
export interface PositionFix {
  readonly coordinate: Coordinate;
  /** direction of travel, null if the device does not know it */
  readonly heading: number | null;
  readonly accuracyM: number;
  /** when it was measured (ms since 1970), if the device says so */
  readonly atMs?: number | null;
}

export interface EstimatedPosition {
  readonly coordinate: Coordinate;
  readonly heading: number;
}

/** A fix this vague is left out while a fresh estimate exists. */
const POOR_ACCURACY_M = 150;
const POOR_IGNORED_S = 30;
/** A fix is moved forward by at most this many seconds of driving. */
const MAX_AGE_S = 5;
/** Driving on without a fix: along the route for long, straight ahead only briefly. */
const BLIND_ON_ROUTE_S = 60;
const BLIND_FREE_S = 8;
const BLIND_ON_ROAD_S = 20;
/** Below this speed (km/h) the car counts as standing. */
const MOVING_KMH = 1;
/** Up to this accuracy a fix is taken as it is; vaguer ones only pull the estimate. */
const TRUSTED_ACCURACY_M = 20;
const MIN_GAIN = 0.25;
/** A fix this far from the estimate replaces it at once. */
const JUMP_M = 60;
const JUMP_ON_ROUTE_M = 150;
/** A fix this close to the route counts as on it. */
const ON_ROUTE_M = 40;
const ON_ROUTE_MAX_M = 150;
const MAX_KMH = 250;
/** How far a road may be away to put the car on it: with a good fix, and with a vague one. */
const ROAD_TRUSTED_M = 12;
const ROAD_MIN_M = 25;
const ROAD_MAX_M = 80;

/**
 * Where the car is between and in spite of the fixes of the device. A tablet
 * without GPS gets its position late, seldom and roughly (Wi-Fi, or the phone
 * whose hotspot it uses). So a fix is moved forward by what was driven since it
 * was measured, a vague one only pulls the estimate, and between two fixes the
 * car drives on with the known speed: along the route if there is one, else
 * along the road it is on if the roads are known, else straight ahead for a few
 * seconds.
 */
export class PositionEstimator {
  private at: Coordinate | null = null;
  private heading = 0;
  private line: Polyline | null = null;
  /** metres on the line while the car is on it */
  private alongM: number | null = null;
  private blindS = 0;
  private last: PositionFix | null = null;
  /** speed worked out from two fixes, for devices and cars that give none */
  private derivedKmh: number | null = null;
  private roads: readonly NearRoad[] | null = null;
  private accuracyM = 0;
  private headingKnown = false;
  private onRoad = false;

  /** The roads around the car; null if they are not known. */
  setRoads(roads: readonly NearRoad[] | null): void {
    this.roads = roads;
  }

  /** The route the car should be on; null without one. */
  follow(line: Polyline | null): void {
    this.line = line;
    this.alongM = null;
  }

  /** A new fix; `speedKmh` from the car or the device, null if neither knows it. */
  fix(fix: PositionFix, speedKmh: number | null, nowMs: number): EstimatedPosition {
    const current = this.current();
    if (current && fix.accuracyM > POOR_ACCURACY_M && this.blindS < POOR_IGNORED_S) return current;

    this.derive(fix);
    const speed = speedKmh ?? this.derivedKmh;
    const ageS =
      typeof fix.atMs === 'number' ? Math.max(0, Math.min(MAX_AGE_S, (nowMs - fix.atMs) / 1000)) : 0;
    const leadM = speed !== null && speed >= MOVING_KMH ? (speed / 3.6) * ageS : 0;
    const gain =
      fix.accuracyM <= TRUSTED_ACCURACY_M
        ? 1
        : Math.max(MIN_GAIN, TRUSTED_ACCURACY_M / fix.accuracyM);
    const heading = fix.heading ?? this.headingFrom(fix);
    this.last = fix;
    this.blindS = 0;

    if (this.line && this.fixOnRoute(this.line, fix, leadM, gain)) return this.current()!;

    this.alongM = null;
    this.accuracyM = fix.accuracyM;
    if (heading !== null) {
      this.heading = heading;
      this.headingKnown = true;
    }
    const target = leadM > 0 ? move(fix.coordinate, this.heading, leadM) : fix.coordinate;
    const off = this.at ? distanceM(this.at, target) : Infinity;
    if (!this.at || gain === 1 || off > JUMP_M + fix.accuracyM) {
      this.at = target;
    } else if (speed === null || speed >= MOVING_KMH) {
      // Standing, a vague fix only wanders about: the car stays where it is.
      this.at = mix(this.at, target, gain);
    }
    this.toRoad();
    return this.current()!;
  }

  /** Drives on for `seconds`; null if nothing moved or the last fix is too old. */
  advance(seconds: number, speedKmh: number | null): EstimatedPosition | null {
    const speed = speedKmh ?? this.derivedKmh;
    if (!this.at || speed === null || speed < MOVING_KMH) return null;
    this.blindS += seconds;
    const limit =
      this.alongM !== null ? BLIND_ON_ROUTE_S : this.onRoad ? BLIND_ON_ROAD_S : BLIND_FREE_S;
    if (this.blindS > limit) return null;
    const metres = (Math.min(speed, MAX_KMH) / 3.6) * seconds;
    if (this.line && this.alongM !== null) {
      this.place(this.line, this.alongM + metres);
    } else {
      this.at = move(this.at, this.heading, metres);
      this.toRoad();
    }
    return this.current();
  }

  private current(): EstimatedPosition | null {
    return this.at ? { coordinate: this.at, heading: this.heading } : null;
  }

  /** Puts the car onto the road it most likely drives on, and turns it the way the road goes. */
  private toRoad(): void {
    this.onRoad = false;
    if (!this.at || !this.roads) return;
    const trusted = this.accuracyM <= TRUSTED_ACCURACY_M;
    // A good fix without a direction is a standing car, maybe beside the road.
    if (trusted && !this.headingKnown) return;
    const reach = trusted
      ? ROAD_TRUSTED_M
      : Math.max(ROAD_MIN_M, Math.min(this.accuracyM, ROAD_MAX_M));
    const match = matchRoad(this.roads, this.at, this.headingKnown ? this.heading : null, reach);
    if (!match) return;
    this.at = match.coordinate;
    if (match.heading !== null) this.heading = match.heading;
    this.onRoad = true;
  }

  private fixOnRoute(line: Polyline, fix: PositionFix, leadM: number, gain: number): boolean {
    const window =
      this.alongM === null ? undefined : { fromM: this.alongM - 300, toM: this.alongM + 1500 };
    const { offsetM, alongM } = snap(line, fix.coordinate, window);
    if (offsetM > Math.max(ON_ROUTE_M, Math.min(fix.accuracyM, ON_ROUTE_MAX_M))) return false;
    const target = alongM + leadM;
    const jump = this.alongM === null || Math.abs(target - this.alongM) > JUMP_ON_ROUTE_M;
    this.place(line, jump ? target : this.alongM! + (target - this.alongM!) * gain);
    return true;
  }

  private place(line: Polyline, alongM: number): void {
    this.alongM = Math.max(0, Math.min(line.lengthM, alongM));
    const { point, heading } = pointAt(line, this.alongM);
    this.at = point;
    this.heading = heading;
  }

  /** Direction from the fix before, once the car clearly moved. */
  private headingFrom(fix: PositionFix): number | null {
    if (!this.last) return null;
    const moved = distanceM(this.last.coordinate, fix.coordinate);
    return moved > Math.max(15, fix.accuracyM) ? bearing(this.last.coordinate, fix.coordinate) : null;
  }

  private derive(fix: PositionFix): void {
    const before = this.last;
    if (!before || typeof fix.atMs !== 'number' || typeof before.atMs !== 'number') return;
    const seconds = (fix.atMs - before.atMs) / 1000;
    if (seconds < 0.5 || seconds > 30) {
      if (seconds > 30) this.derivedKmh = null;
      return;
    }
    const moved = distanceM(before.coordinate, fix.coordinate);
    // Less than the fixes are apart by chance: standing, or too slow to tell.
    this.derivedKmh =
      moved < Math.max(fix.accuracyM, before.accuracyM) / 2
        ? 0
        : Math.min(MAX_KMH, (moved / seconds) * 3.6);
  }
}

function mix(a: Coordinate, b: Coordinate, share: number): Coordinate {
  return [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share];
}
