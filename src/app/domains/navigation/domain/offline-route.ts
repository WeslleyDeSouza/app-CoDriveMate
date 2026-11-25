import { Coordinate, distanceM, polyline } from './geo';
import {
  Hop,
  NameLine,
  ROAD_KINDS,
  RoadGraph,
  RoadLine,
  RoadTile,
  TilePoint,
  tileAt,
  toCoordinate,
} from './road-graph';
import { NoRouteError, Route, RouteStep } from './route';

const MAX_DISTANCE_M = 120_000;
export const MAX_ROAD_TILES = 600;
const MARGIN_SHARE = 0.3;
const MIN_MARGIN_TILES = 3;

/**
 * Tiles in a corridor around both ends, nearest to the straight line first.
 * Throws if they are too far apart.
 */
export function tilesForRoute(from: Coordinate, to: Coordinate): { x: number; y: number }[] {
  if (distanceM(from, to) > MAX_DISTANCE_M) throw new NoRouteError();
  const a = tileAt(from);
  const b = tileAt(to);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const margin = Math.max(MIN_MARGIN_TILES, Math.ceil(length * MARGIN_SHARE));
  const found: { x: number; y: number; away: number }[] = [];
  for (let x = Math.min(a.x, b.x) - margin; x <= Math.max(a.x, b.x) + margin; x++) {
    for (let y = Math.min(a.y, b.y) - margin; y <= Math.max(a.y, b.y) + margin; y++) {
      const [dx, dy] = [b.x - a.x, b.y - a.y];
      const along = ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1);
      const t = Math.max(0, Math.min(1, along));
      found.push({ x, y, away: Math.hypot(a.x + dx * t - x, a.y + dy * t - y) });
    }
  }
  return found
    .sort((p, q) => p.away - q.away)
    .slice(0, MAX_ROAD_TILES)
    .map(({ x, y }) => ({ x, y }));
}

/** Calculates a route on the roads of the tiles. Throws if there is none. */
export function offlineRoute(tiles: readonly RoadTile[], from: Coordinate, to: Coordinate): Route {
  if (!tiles.length) throw new NoRouteError();
  const graph = new RoadGraph(tiles);
  const path = graph.path(from, to);
  if (!path) throw new NoRouteError();
  const points = [path.hops[0].start, ...path.hops.map(({ end }) => end)]
    .filter((p, i, all) => !i || p.x !== all[i - 1].x || p.y !== all[i - 1].y)
    .map(toCoordinate);
  if (points.length < 2) points.push(points[0]);
  const line = polyline(points);
  return {
    provider: 'osm',
    line,
    durationS: path.durationS,
    delayS: 0,
    steps: new Directions(graph, path.hops, namesAlong(path.hops, tiles), line.lengthM).steps(),
    congestion: [],
  };
}

// --- street names ---

const UNITS = 4096;
const NAME_REACH = 14;
const NAME_ANGLE = 30;
/** A gap in the names of a street that is closed again. */
const NAME_GAP_M = 60;

/** Street name per hop. Names come as separate lines, so they are matched by place. */
function namesAlong(hops: readonly Hop[], tiles: readonly RoadTile[]): string[] {
  const byPlace = new Map(tiles.map((tile) => [`${tile.x}/${tile.y}`, tile]));
  const lines = new Map<string, readonly NameLine[]>();
  const names = hops.map((hop) => {
    const middle = { x: (hop.start.x + hop.end.x) / 2, y: (hop.start.y + hop.end.y) / 2 };
    const [x, y] = [Math.floor(middle.x / UNITS), Math.floor(middle.y / UNITS)];
    const key = `${x}/${y}`;
    const tile = byPlace.get(key);
    if (!tile) return '';
    if (!lines.has(key)) lines.set(key, tile.names());
    const scale = tile.extent / UNITS;
    const place = { x: (middle.x - x * UNITS) * scale, y: (middle.y - y * UNITS) * scale };
    return nameAt(place, hop, lines.get(key)!);
  });
  fillGaps(names, hops);
  return names;
}

function nameAt(p: TilePoint, hop: Hop, lines: readonly NameLine[]): string {
  const [hx, hy] = [hop.end.x - hop.start.x, hop.end.y - hop.start.y];
  let best = { name: '', cost: Infinity };
  for (const { name, points } of lines) {
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      if (Math.min(a.x, b.x) > p.x + NAME_REACH || Math.max(a.x, b.x) < p.x - NAME_REACH) continue;
      if (Math.min(a.y, b.y) > p.y + NAME_REACH || Math.max(a.y, b.y) < p.y - NAME_REACH) continue;
      const [dx, dy] = [b.x - a.x, b.y - a.y];
      const along = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1);
      const t = Math.max(0, Math.min(1, along));
      const away = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
      // Both directions count; the shortest pieces have none worth comparing.
      const sine = Math.abs(hx * dy - hy * dx) / (Math.hypot(hx, hy) * Math.hypot(dx, dy) || 1);
      const angle = Math.hypot(hx, hy) < 8 ? 0 : (Math.asin(Math.min(1, sine)) * 180) / Math.PI;
      const cost = away + angle / 5;
      if (away <= NAME_REACH && angle <= NAME_ANGLE && cost < best.cost) best = { name, cost };
    }
  }
  return best.name;
}

function fillGaps(names: string[], hops: readonly Hop[]): void {
  for (let i = 0; i < names.length;) {
    let j = i;
    let length = 0;
    while (j < names.length && names[j] === names[i]) length += hops[j++].lengthM;
    const between = i > 0 && j < names.length && names[i - 1] === names[j];
    if (between && length < (names[i] ? 15 : NAME_GAP_M)) names.fill(names[i - 1], i, j);
    i = j;
  }
}

// --- manoeuvres ---

const STRAIGHT = 30;
const LOOK_M = 15;
/** Two turns the same way within this distance are one, e.g. across a divided road. */
const ONE_TURN_M = 25;

interface Branch {
  readonly road: RoadLine;
  readonly angle: number;
}

/** Finds the places on a path where the driver must be told something. */
class Directions {
  private readonly along: number[] = [0];

  constructor(
    private readonly graph: RoadGraph,
    private readonly hops: readonly Hop[],
    private readonly names: readonly string[],
    private readonly lengthM: number,
  ) {
    hops.forEach(({ lengthM: metres }, i) => this.along.push(this.along[i] + metres));
    // The same end as the line, whose length is measured a little differently.
    const factor = this.along[hops.length] ? lengthM / this.along[hops.length] : 1;
    this.along.forEach((metres, i) => (this.along[i] = metres * factor));
  }

  steps(): RouteStep[] {
    const { hops, names } = this;
    const found: (RouteStep & { angle: number })[] = [];
    const add = (i: number, type: string, angle: number, exit: number | null, street: string) => {
      const last = found[found.length - 1];
      const alongM = this.along[i];
      const oneTurn =
        last?.maneuver.type === 'turn' &&
        type === 'turn' &&
        alongM - last.alongM < ONE_TURN_M &&
        Math.sign(last.angle) === Math.sign(angle);
      const total = oneTurn ? last.angle + angle : angle;
      if (oneTurn) found.pop();
      found.push({
        maneuver: { type, modifier: modifierOf(total), exit },
        street,
        alongM: oneTurn ? last.alongM : alongM,
        angle: total,
      });
    };
    for (let i = 1; i < hops.length; i++) {
      if (this.inRoundabout(i) && !this.inRoundabout(i - 1)) {
        let end = i;
        let exits = 0;
        while (end < hops.length && this.inRoundabout(end)) {
          end++;
          const leaves = this.graph
            .exits(hops[end - 1].to)
            .some(({ edge }) => !this.graph.isRoundabout(edge));
          if (leaves) exits++;
        }
        // The destination is in the roundabout.
        if (end === hops.length) break;
        const angle = turn(this.heading(i, -1), this.heading(end, 1));
        add(i, 'roundabout', angle, exits, names[end]);
        i = end;
        continue;
      }
      const step = this.decide(i);
      if (step) add(i, step.type, step.angle, null, this.streetAfter(i));
    }
    const depart = { type: 'depart', modifier: '', exit: null };
    const arrive = { type: 'arrive', modifier: '', exit: null };
    return [
      { maneuver: depart, street: this.streetAfter(0), alongM: 0 },
      ...found.map(({ maneuver, street, alongM }) => ({ maneuver, street, alongM })),
      { maneuver: arrive, street: '', alongM: this.lengthM },
    ];
  }

  /** What to say at the start of hop `i`. */
  private decide(i: number): { type: string; angle: number } | null {
    const { hops, graph, names } = this;
    const before = graph.road(hops[i - 1].edge);
    const after = graph.road(hops[i].edge);
    const fast = (road: RoadLine) => road.kind === 'motorway' || road.kind === 'trunk';
    const onRamp = fast(before) && before.ramp;
    const toRamp = fast(after) && after.ramp;
    if (onRamp && fast(after) && !after.ramp) return { type: 'merge', angle: 0 };

    const heading = this.heading(i, -1);
    const angle = turn(heading, this.heading(i, 1));
    const others = this.branches(i, heading);
    if (!others.length) return null;

    if (toRamp && !onRamp) {
      return { type: fast(before) ? 'off ramp' : 'on ramp', angle: angle || 1 };
    }
    if (Math.abs(angle) < STRAIGHT) {
      const rank = (road: RoadLine) => ROAD_KINDS.indexOf(road.kind);
      const rival = others.find(
        (other) =>
          Math.abs(other.angle) < STRAIGHT &&
          rank(other.road) <= rank(after) &&
          // Staying on the main road is obvious, its slip roads are not.
          !(other.road.ramp && !after.ramp),
      );
      if (rival) return { type: 'fork', angle: Math.sign(angle - rival.angle) * STRAIGHT };
      const [from, to] = [names[i - 1], this.streetAfter(i)];
      return from && to && from !== to && this.changesFor(i, from)
        ? { type: 'new name', angle: 0 }
        : null;
    }
    const straighter = others.some((other) => Math.abs(other.angle) < Math.abs(angle) - 10);
    const sameStreet = !!names[i] && names[i] === names[i - 1];
    const onlyYards =
      after.kind === before.kind && others.every(({ road }) => road.kind === 'service');
    // The road bends and something smaller joins it there.
    if (!straighter && Math.abs(angle) < 75 && (sameStreet || onlyYards)) return null;
    return { type: 'turn', angle };
  }

  /** The other roads a car could take at the start of hop `i`. */
  private branches(i: number, heading: number): Branch[] {
    const { graph, hops } = this;
    return graph
      .exits(hops[i].from)
      .filter(({ to }) => to !== hops[i - 1].from && to !== hops[i].to)
      .map(({ edge, to }) => ({
        road: graph.road(edge),
        angle: turn(heading, this.headingOf(hops[i].from, edge, to)),
      }))
      .filter(({ angle }) => Math.abs(angle) < 160);
  }

  /** Direction of the first metres of a road. */
  private headingOf(node: number, edge: number, to: number): number {
    const start = this.graph.point(node);
    let [from, at, length] = [node, to, this.graph.length(edge)];
    while (length < LOOK_M) {
      const next = this.graph.exits(at).filter((exit) => exit.to !== from);
      if (next.length !== 1) break;
      [from, at, length] = [at, next[0].to, length + this.graph.length(next[0].edge)];
    }
    return direction(start, this.graph.point(at));
  }

  /** Direction of the path before (-1) or after (1) the start of hop `i`. */
  private heading(i: number, side: -1 | 1): number {
    const { hops } = this;
    const node = hops[i].start;
    let j = side < 0 ? i - 1 : i;
    let length = hops[j].lengthM;
    while (length < LOOK_M && hops[j + side]) length += hops[(j += side)].lengthM;
    return side < 0 ? direction(hops[j].start, node) : direction(node, hops[j].end);
  }

  /** The name of the street soon after the start of hop `i`. */
  private streetAfter(i: number): string {
    for (let j = i; j < this.hops.length && this.along[j] - this.along[i] < 60; j++) {
      if (this.names[j]) return this.names[j];
    }
    return '';
  }

  /** The old name does not come back at once. */
  private changesFor(i: number, name: string): boolean {
    for (let j = i; j < this.hops.length && this.along[j] - this.along[i] < 100; j++) {
      if (this.names[j] === name) return false;
    }
    return true;
  }

  private inRoundabout(i: number): boolean {
    return this.graph.isRoundabout(this.hops[i].edge);
  }
}

/** Degrees clockwise from north. */
function direction(a: TilePoint, b: TilePoint): number {
  return (Math.atan2(b.x - a.x, a.y - b.y) * 180) / Math.PI;
}

/** -180 to 180, right is positive. */
function turn(before: number, after: number): number {
  return ((((after - before + 180) % 360) + 360) % 360) - 180;
}

function modifierOf(angle: number): string {
  const size = Math.abs(angle);
  if (size > 170) return 'uturn';
  const side = angle < 0 ? 'left' : 'right';
  if (size > 120) return 'sharp ' + side;
  if (size > 50) return side;
  return size > 0 ? 'slight ' + side : 'straight';
}
