import { Coordinate, distanceM } from './geo';

export const ROAD_ZOOM = 14;
/** Grid units of a tile; everything below is counted in these, about 0.4 m. */
const UNITS = 4096;
const WORLD = UNITS * 2 ** ROAD_ZOOM;
const EARTH_M = 40075016.686;

export interface TilePoint {
  readonly x: number;
  readonly y: number;
}

/** A road of a tile, points in units of its extent. */
export interface RoadLine {
  readonly kind: string;
  readonly ramp: boolean;
  /** 1 along the points, -1 against them */
  readonly oneway: 0 | 1 | -1;
  readonly tunnel: boolean;
  /** roads crossing on different levels do not meet; -60 to 60 */
  readonly level: number;
  readonly points: readonly TilePoint[];
}

export interface NameLine {
  readonly name: string;
  readonly kind: string;
  readonly points: readonly TilePoint[];
}

export interface RoadTile {
  readonly x: number;
  readonly y: number;
  readonly extent: number;
  readonly roads: readonly RoadLine[];
  /** Only asked for tiles the route touches. */
  names(): readonly NameLine[];
}

/** Kinds cars may use, with the average speed in km/h. */
const SPEEDS: Readonly<Record<string, number>> = {
  motorway: 90,
  trunk: 68,
  primary: 50,
  secondary: 45,
  tertiary: 38,
  minor: 25,
  service: 12,
};
const RAMP_SPEEDS: Readonly<Record<string, number>> = { motorway: 60, trunk: 55 };
/** From the most to the least important. */
export const ROAD_KINDS: readonly string[] = Object.keys(SPEEDS);
const MAX_SPEED_MS = Math.max(...Object.values(SPEEDS)) / 3.6;

/** Simplified lines may miss a junction by about this many units. */
const JOIN = 2;
const BORDER_JOIN = 4;
/** For roads of the same kind, which may cross a border at a flat angle. */
const BORDER_JOIN_SAME = 16;
const CELL = 128;
const CELLS = UNITS / CELL;

const SNAP_MAX_M = 300;
/** Roundabouts are often not marked as one-way, so they are known by their shape. */
const ROUNDABOUT_MIN_M = 30;
const ROUNDABOUT_MAX_M = 250;
const ROUNDABOUT_MAX_BEND = 100;
/** 1 is a circle, 0.79 a square */
const ROUNDABOUT_MIN_ROUND = 0.84;
const ROUNDABOUT_KMH = 25;

/** Slowing down for a turn at a junction, and for turning round. */
const TURN_S = 8;
const UTURN_S = 25;
const TURN_DEGREES = 40;

/** A position is rarely measured in a tunnel. */
const TUNNEL_SNAP_M = 30;

export function tileAt(place: Coordinate): { x: number; y: number } {
  const { x, y } = toUnits(place);
  return { x: Math.floor(x / UNITS), y: Math.floor(y / UNITS) };
}

function toUnits([lon, lat]: Coordinate): TilePoint {
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * WORLD,
    y: (0.5 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / (2 * Math.PI)) * WORLD,
  };
}

/** Coordinate of a point of the graph. */
export function toCoordinate({ x, y }: TilePoint): Coordinate {
  return [
    (x / WORLD) * 360 - 180,
    (Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / WORLD)) * 180) / Math.PI,
  ];
}

/** Metres per unit at a place. */
function scaleAt(y: number): number {
  return EARTH_M / WORLD / Math.cosh(Math.PI - (2 * Math.PI * y) / WORLD);
}

/** One edge of the path, in driving direction. */
export interface Hop {
  readonly edge: number;
  readonly from: number;
  readonly to: number;
  readonly start: TilePoint;
  readonly end: TilePoint;
  readonly lengthM: number;
}

export interface RoadPath {
  readonly hops: readonly Hop[];
  readonly durationS: number;
}

interface Snap {
  readonly edge: number;
  /** share of the edge, 0 at its first node */
  readonly t: number;
  readonly penaltyS: number;
}

/** Roads of several tiles, joined to one network. */
export class RoadGraph {
  // Nodes before joining; `find` gives the joined one.
  private readonly x: number[] = [];
  private readonly y: number[] = [];
  private readonly joined: number[] = [];
  private readonly byPlace = new Map<number, number>();
  private readonly originX: number;
  private readonly originY: number;

  // Edges
  private readonly a: number[] = [];
  private readonly b: number[] = [];
  private readonly metres: number[] = [];
  private readonly seconds: number[] = [];
  private readonly roads: RoadLine[] = [];
  private readonly oneWay: boolean[] = [];
  private readonly roundabout = new Set<number>();

  // Edges leaving a node: edge * 2, + 1 if driven from b to a.
  private first = new Uint32Array(0);
  private leaving = new Uint32Array(0);

  constructor(tiles: readonly RoadTile[]) {
    this.originX = Math.min(...tiles.map((tile) => tile.x)) * UNITS;
    this.originY = Math.min(...tiles.map((tile) => tile.y)) * UNITS;
    const borders = new Map<string, BorderEnd[]>();
    const chains = tiles.map((tile) => new TileChains(tile, this, borders).split());
    for (const ends of borders.values()) this.joinBorder(ends);
    for (const tile of chains) {
      for (const { road, nodes } of tile) {
        for (let i = 1; i < nodes.length; i++) this.addEdge(nodes[i - 1], nodes[i], road);
      }
    }
    this.byPlace.clear();
    this.index();
    if (this.findRoundabouts()) this.index();
  }

  get edgeCount(): number {
    return this.a.length;
  }

  road(edge: number): RoadLine {
    return this.roads[edge];
  }

  isRoundabout(edge: number): boolean {
    return this.roundabout.has(edge);
  }

  length(edge: number): number {
    return this.metres[edge];
  }

  point(node: number): TilePoint {
    return { x: this.x[node], y: this.y[node] };
  }

  /** Edges a car can take from a node. */
  exits(node: number): { edge: number; to: number }[] {
    const result: { edge: number; to: number }[] = [];
    for (let i = this.first[node]; i < this.first[node + 1]; i++) {
      const edge = this.leaving[i] >> 1;
      result.push({ edge, to: this.leaving[i] & 1 ? this.a[edge] : this.b[edge] });
    }
    return result;
  }

  /** Fastest way, or null. */
  path(from: Coordinate, to: Coordinate): RoadPath | null {
    const starts = this.near(from);
    const goals = this.near(to);
    if (!starts.length || !goals.length) return null;
    const nearest = (snaps: readonly Snap[]) => [
      snaps.reduce((best, snap) => (snap.penaltyS < best.penaltyS ? snap : best)),
    ];
    // The nearest road may be an island, or a one-way road leading out of the area.
    return (
      this.search(nearest(starts), nearest(goals), to) ??
      this.search(starts, nearest(goals), to) ??
      this.search(starts, goals, to)
    );
  }

  // --- building, used by TileChains ---

  node(x: number, y: number, level: number): number {
    const key = ((x - this.originX) * 2 ** 22 + (y - this.originY)) * 128 + level + 64;
    const known = this.byPlace.get(key);
    if (known !== undefined) return known;
    const id = this.x.length;
    this.x.push(x);
    this.y.push(y);
    this.joined.push(id);
    this.byPlace.set(key, id);
    return id;
  }

  join(a: number, b: number): void {
    this.joined[this.find(a)] = this.find(b);
  }

  private find(node: number): number {
    while (this.joined[node] !== node) {
      this.joined[node] = this.joined[this.joined[node]];
      node = this.joined[node];
    }
    return node;
  }

  private joinBorder(ends: readonly BorderEnd[]): void {
    const pairs: { cost: number; a: BorderEnd; b: BorderEnd }[] = [];
    const before = ends.filter((end) => end.before);
    const after = ends.filter((end) => !end.before);
    for (const a of before) {
      for (const b of after) {
        const gap = Math.abs(a.at - b.at);
        const same = a.road.kind === b.road.kind && a.road.oneway === b.road.oneway;
        if (gap > (same ? BORDER_JOIN_SAME : BORDER_JOIN)) continue;
        const cost = gap + (same ? 0 : 20) + (a.road.level === b.road.level ? 0 : 5);
        pairs.push({ cost, a, b });
      }
    }
    pairs.sort((p, q) => p.cost - q.cost);
    const done = new Set<BorderEnd>();
    for (const { a, b } of pairs) {
      if (done.has(a) || done.has(b)) continue;
      done.add(a).add(b);
      this.join(a.node, b.node);
    }
  }

  private addEdge(from: number, to: number, road: RoadLine): void {
    const a = this.find(from);
    const b = this.find(to);
    if (a === b) return;
    const metres =
      Math.hypot(this.x[a] - this.x[b], this.y[a] - this.y[b]) * scaleAt(this.y[a]) || 0.1;
    const speed = (road.ramp && RAMP_SPEEDS[road.kind]) || SPEEDS[road.kind];
    this.a.push(road.oneway < 0 ? b : a);
    this.b.push(road.oneway < 0 ? a : b);
    this.metres.push(metres);
    this.seconds.push((metres * 3.6) / speed);
    this.roads.push(road);
    this.oneWay.push(road.oneway !== 0);
  }

  private index(): void {
    this.first = new Uint32Array(this.x.length + 2);
    for (let e = 0; e < this.a.length; e++) {
      this.first[this.a[e] + 2]++;
      if (!this.oneWay[e]) this.first[this.b[e] + 2]++;
    }
    for (let n = 2; n < this.first.length; n++) this.first[n] += this.first[n - 1];
    this.leaving = new Uint32Array(this.first[this.first.length - 1]);
    for (let e = 0; e < this.a.length; e++) {
      this.leaving[this.first[this.a[e] + 1]++] = e * 2;
      if (!this.oneWay[e]) this.leaving[this.first[this.b[e] + 1]++] = e * 2 + 1;
    }
  }

  /** Small circles are driven to the left all the way round. */
  private findRoundabouts(): boolean {
    for (let node = 0; node < this.x.length; node++) {
      if (this.first[node + 1] - this.first[node] < 2) continue;
      for (let i = this.first[node]; i < this.first[node + 1]; i++) {
        const { kind } = this.roads[this.leaving[i] >> 1];
        if (kind === 'motorway' || kind === 'service') continue;
        if (this.roundabout.has(this.leaving[i] >> 1)) continue;
        for (const way of this.circle(this.leaving[i])) {
          const edge = way >> 1;
          if (way & 1) [this.a[edge], this.b[edge]] = [this.b[edge], this.a[edge]];
          this.oneWay[edge] = true;
          this.seconds[edge] = (this.metres[edge] * 3.6) / ROUNDABOUT_KMH;
          this.roundabout.add(edge);
        }
      }
    }
    return this.roundabout.size > 0;
  }

  /** The edges of a roundabout, entries as in `leaving`; empty if it is none. */
  private circle(first: number): number[] {
    const from = first & 1 ? this.b[first >> 1] : this.a[first >> 1];
    const { kind } = this.roads[first >> 1];
    const ways: number[] = [];
    let [way, before] = [first, from];
    let [metres, bend, area, branches] = [0, 0, 0, 0];
    for (;;) {
      const edge = way >> 1;
      const at = way & 1 ? this.a[edge] : this.b[edge];
      ways.push(way);
      metres += this.metres[edge];
      if (metres > ROUNDABOUT_MAX_M) return [];
      area +=
        (this.x[before] - this.x[from]) * (this.y[at] - this.y[from]) -
        (this.x[at] - this.x[from]) * (this.y[before] - this.y[from]);
      if (at === from) break;

      const [ux, uy] = [this.x[at] - this.x[before], this.y[at] - this.y[before]];
      let best = { way: -1, angle: Infinity };
      let others = 0;
      for (let i = this.first[at]; i < this.first[at + 1]; i++) {
        const next =
          this.leaving[i] & 1 ? this.a[this.leaving[i] >> 1] : this.b[this.leaving[i] >> 1];
        if (next === before) continue;
        others++;
        const [vx, vy] = [this.x[next] - this.x[at], this.y[next] - this.y[at]];
        const angle = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * (180 / Math.PI);
        if (angle < best.angle) best = { way: this.leaving[i], angle };
      }
      if (best.way < 0 || Math.abs(best.angle) > ROUNDABOUT_MAX_BEND) return [];
      if (this.roads[best.way >> 1].kind !== kind) return [];
      bend += best.angle;
      if (Math.abs(bend + 180) > 260) return [];
      if (others > 1) branches++;
      [way, before] = [best.way, at];
    }
    const scale = scaleAt(this.y[from]);
    const round = (-2 * Math.PI * area * scale * scale) / (metres * metres);
    // The junction at the start was not counted. A single one is a dead end.
    return metres >= ROUNDABOUT_MIN_M && round >= ROUNDABOUT_MIN_ROUND && branches >= 1 ? ways : [];
  }

  // --- search ---

  private near(place: Coordinate): Snap[] {
    const p = toUnits(place);
    const scale = scaleAt(p.y);
    const reach = SNAP_MAX_M / scale;
    const result: Snap[] = [];
    for (let edge = 0; edge < this.a.length; edge++) {
      const ax = this.x[this.a[edge]] - p.x;
      const ay = this.y[this.a[edge]] - p.y;
      const bx = this.x[this.b[edge]] - p.x;
      const by = this.y[this.b[edge]] - p.y;
      if (Math.min(ax, bx) > reach || Math.max(ax, bx) < -reach) continue;
      if (Math.min(ay, by) > reach || Math.max(ay, by) < -reach) continue;
      const t = footOf(ax, ay, bx, by);
      const offsetM = Math.hypot(ax + (bx - ax) * t, ay + (by - ay) * t) * scale;
      if (offsetM > SNAP_MAX_M) continue;
      const penaltyS = offsetM + (this.roads[edge].tunnel ? TUNNEL_SNAP_M : 0);
      result.push({ edge, t, penaltyS });
    }
    return result;
  }

  /** A* by time. */
  private search(
    starts: readonly Snap[],
    goals: readonly Snap[],
    target: Coordinate,
  ): RoadPath | null {
    const count = this.x.length;
    const cost = new Float64Array(count).fill(Infinity);
    const via = new Int32Array(count).fill(-1);
    const done = new Uint8Array(count);
    const open = new Heap();
    // The search may end anywhere near the target, so nothing is overestimated.
    const rest = (node: number) =>
      Math.max(0, distanceM(toCoordinate(this.point(node)), target) - SNAP_MAX_M) / MAX_SPEED_MS;
    const offer = (node: number, value: number, from: number) => {
      if (value >= cost[node]) return;
      cost[node] = value;
      via[node] = from;
      open.push(node, value + rest(node));
    };
    let best = Infinity;
    let end: { node: number; goal: Snap; start?: Snap } | null = null;

    const startOf = new Map<number, Snap>();
    for (const start of starts) {
      const seconds = this.seconds[start.edge];
      const begin = (node: number, value: number) => {
        if (value < cost[node]) startOf.set(node, start);
        offer(node, value, -2);
      };
      begin(this.b[start.edge], start.penaltyS + (1 - start.t) * seconds);
      if (!this.oneWay[start.edge]) {
        begin(this.a[start.edge], start.penaltyS + start.t * seconds);
      }
    }
    const goalsAt = new Map<number, { goal: Snap; value: number }[]>();
    const reach = (node: number, goal: Snap, value: number) => {
      const list = goalsAt.get(node);
      if (list) list.push({ goal, value });
      else goalsAt.set(node, [{ goal, value }]);
    };
    const startsOn = new Map(starts.map((start) => [start.edge, start]));
    for (const goal of goals) {
      const seconds = this.seconds[goal.edge];
      const twoWay = !this.oneWay[goal.edge];
      reach(this.a[goal.edge], goal, goal.penaltyS + goal.t * seconds);
      if (twoWay) reach(this.b[goal.edge], goal, goal.penaltyS + (1 - goal.t) * seconds);
      const start = startsOn.get(goal.edge);
      if (start && (twoWay || goal.t >= start.t)) {
        const value = start.penaltyS + goal.penaltyS + Math.abs(goal.t - start.t) * seconds;
        if (value < best) [best, end] = [value, { node: -1, goal, start }];
      }
    }

    for (let node = open.pop(); node >= 0 && open.lastKey < best; node = open.pop()) {
      if (done[node]) continue;
      done[node] = 1;
      for (const { goal, value } of goalsAt.get(node) ?? []) {
        if (cost[node] + value < best) [best, end] = [cost[node] + value, { node, goal }];
      }
      for (let i = this.first[node]; i < this.first[node + 1]; i++) {
        const edge = this.leaving[i] >> 1;
        const next = this.leaving[i] & 1 ? this.a[edge] : this.b[edge];
        if (done[next]) continue;
        const delay = this.turnDelay(via[node], this.leaving[i], node);
        offer(next, cost[node] + delay + this.seconds[edge], this.leaving[i]);
      }
    }
    if (!end) return null;

    const { goal, node } = end;
    if (end.start) {
      const forward = goal.t >= end.start.t;
      const [a, b] = [this.a[goal.edge], this.b[goal.edge]];
      const [from, to] = forward ? [a, b] : [b, a];
      const hop = this.hop(goal.edge, from, to, this.onEdge(end.start), this.onEdge(goal));
      return { hops: [hop], durationS: best - end.start.penaltyS - goal.penaltyS };
    }
    const after = this.a[goal.edge] === node ? this.b[goal.edge] : this.a[goal.edge];
    const hops = [this.hop(goal.edge, node, after, this.point(node), this.onEdge(goal))];
    let at = node;
    while (via[at] !== -2) {
      const edge = via[at] >> 1;
      const before = via[at] & 1 ? this.b[edge] : this.a[edge];
      hops.push(this.hop(edge, before, at, this.point(before), this.point(at)));
      at = before;
    }
    const start = startOf.get(at)!;
    const before = this.b[start.edge] === at ? this.a[start.edge] : this.b[start.edge];
    hops.push(this.hop(start.edge, before, at, this.onEdge(start), this.point(at)));
    return { hops: hops.reverse(), durationS: best - start.penaltyS - goal.penaltyS };
  }

  /** Seconds lost by turning at a node; `before` and `after` as in `leaving`. */
  private turnDelay(before: number, after: number, node: number): number {
    if (before < 0 || this.first[node + 1] - this.first[node] < 3) return 0;
    const start = before & 1 ? this.b[before >> 1] : this.a[before >> 1];
    const end = after & 1 ? this.a[after >> 1] : this.b[after >> 1];
    const [ux, uy] = [this.x[node] - this.x[start], this.y[node] - this.y[start]];
    const [vx, vy] = [this.x[end] - this.x[node], this.y[end] - this.y[node]];
    // Too short to have a direction of its own.
    if (Math.hypot(ux, uy) < 4 || Math.hypot(vx, vy) < 4) return 0;
    const angle = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)) * (180 / Math.PI);
    return angle > 150 ? UTURN_S : angle > TURN_DEGREES ? TURN_S : 0;
  }

  private hop(edge: number, from: number, to: number, start: TilePoint, end: TilePoint): Hop {
    const lengthM = Math.hypot(end.x - start.x, end.y - start.y) * scaleAt(start.y);
    return { edge, from, to, start, end, lengthM };
  }

  private onEdge({ edge, t }: Snap): TilePoint {
    const [a, b] = [this.a[edge], this.b[edge]];
    return {
      x: this.x[a] + (this.x[b] - this.x[a]) * t,
      y: this.y[a] + (this.y[b] - this.y[a]) * t,
    };
  }
}

/** Where a road leaves its tile. */
interface BorderEnd {
  readonly node: number;
  /** position along the border */
  readonly at: number;
  /** west or north of the border */
  readonly before: boolean;
  readonly road: RoadLine;
}

interface Chain {
  readonly road: RoadLine;
  readonly nodes: number[];
}

/** The roads of one tile, cut at its border and split where they meet. */
class TileChains {
  private readonly chains: Chain[] = [];
  // Segments between two nodes
  private readonly segmentChain: number[] = [];
  private readonly segmentIndex: number[] = [];
  private readonly inserted = new Map<number, { t: number; node: number }[]>();
  private readonly ends = new Set<number>();

  constructor(
    private readonly tile: RoadTile,
    private readonly graph: RoadGraph,
    private readonly borders: Map<string, BorderEnd[]>,
  ) {
    for (const road of tile.roads) {
      if (SPEEDS[road.kind] === undefined) continue;
      for (const part of clip(road.points, tile.extent)) this.add(road, part);
    }
  }

  private add(road: RoadLine, part: readonly TilePoint[]): void {
    const factor = UNITS / this.tile.extent;
    const nodes: number[] = [];
    for (const p of part) {
      const node = this.graph.node(
        this.tile.x * UNITS + Math.round(p.x * factor),
        this.tile.y * UNITS + Math.round(p.y * factor),
        road.level,
      );
      if (nodes[nodes.length - 1] !== node) nodes.push(node);
    }
    for (const node of new Set([nodes[0], nodes[nodes.length - 1]])) this.addBorder(node, road);
    if (nodes.length < 2) return;
    this.ends.add(nodes[0]).add(nodes[nodes.length - 1]);
    this.chains.push({ road, nodes });
    for (let i = 1; i < nodes.length; i++) {
      this.segmentChain.push(this.chains.length - 1);
      this.segmentIndex.push(i - 1);
    }
  }

  private addBorder(node: number, road: RoadLine): void {
    const { x, y } = this.graph.point(node);
    const { x: tx, y: ty } = this.tile;
    const put = (key: string, at: number, before: boolean) => {
      const ends = this.borders.get(key);
      const end = { node, at, before, road };
      if (ends) ends.push(end);
      else this.borders.set(key, [end]);
    };
    if (x === tx * UNITS) put(`x${tx}/${ty}`, y, false);
    if (x === (tx + 1) * UNITS) put(`x${tx + 1}/${ty}`, y, true);
    if (y === ty * UNITS) put(`y${tx}/${ty}`, x, false);
    if (y === (ty + 1) * UNITS) put(`y${tx}/${ty + 1}`, x, true);
  }

  split(): readonly Chain[] {
    for (const segments of this.grid()) {
      if (!segments) continue;
      for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) this.meet(segments[i], segments[j]);
      }
    }
    // From the last one, so the indices before it stay right.
    for (let segment = this.segmentChain.length - 1; segment >= 0; segment--) {
      const extra = this.inserted.get(segment)?.sort((p, q) => p.t - q.t);
      if (!extra) continue;
      const { nodes } = this.chains[this.segmentChain[segment]];
      nodes.splice(this.segmentIndex[segment] + 1, 0, ...extra.map(({ node }) => node));
    }
    return this.chains;
  }

  private ofSegment(segment: number): [number, number] {
    const { nodes } = this.chains[this.segmentChain[segment]];
    const index = this.segmentIndex[segment];
    return [nodes[index], nodes[index + 1]];
  }

  /** Segments by cell, so only those close together are compared. */
  private grid(): (number[] | undefined)[] {
    const cells: (number[] | undefined)[] = [];
    const cell = (value: number, origin: number) =>
      Math.max(0, Math.min(CELLS - 1, Math.floor((value - origin * UNITS) / CELL)));
    for (let s = 0; s < this.segmentChain.length; s++) {
      const [p, q] = this.ofSegment(s).map((node) => this.graph.point(node));
      const x1 = cell(Math.max(p.x, q.x) + JOIN, this.tile.x);
      const y0 = cell(Math.min(p.y, q.y) - JOIN, this.tile.y);
      const y1 = cell(Math.max(p.y, q.y) + JOIN, this.tile.y);
      for (let cx = cell(Math.min(p.x, q.x) - JOIN, this.tile.x); cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) (cells[cx * CELLS + cy] ??= []).push(s);
      }
    }
    return cells;
  }

  private meet(s1: number, s2: number): void {
    const [a, b] = this.ofSegment(s1);
    const [c, d] = this.ofSegment(s2);
    const [A, B, C, D] = [a, b, c, d].map((node) => this.graph.point(node));
    if (Math.max(A.x, B.x) + JOIN < Math.min(C.x, D.x)) return;
    if (Math.max(C.x, D.x) + JOIN < Math.min(A.x, B.x)) return;
    if (Math.max(A.y, B.y) + JOIN < Math.min(C.y, D.y)) return;
    if (Math.max(C.y, D.y) + JOIN < Math.min(A.y, B.y)) return;
    const neighbours = Math.abs(this.segmentIndex[s1] - this.segmentIndex[s2]) <= 1;
    if (neighbours && this.segmentChain[s1] === this.segmentChain[s2]) return;

    const { level } = this.chains[this.segmentChain[s1]].road;
    const same = level === this.chains[this.segmentChain[s2]].road.level;
    let touched = false;
    for (const node of [c, d]) if (this.touch(node, s1, same)) touched = true;
    for (const node of [a, b]) if (this.touch(node, s2, same)) touched = true;
    if (touched || !same) return;

    const [ux, uy, vx, vy] = [B.x - A.x, B.y - A.y, D.x - C.x, D.y - C.y];
    const det = ux * vy - uy * vx;
    if (!det) return;
    const t = ((C.x - A.x) * vy - (C.y - A.y) * vx) / det;
    const u = ((C.x - A.x) * uy - (C.y - A.y) * ux) / det;
    if (t < 0 || t > 1 || u < 0 || u > 1) return;
    const node = this.graph.node(Math.round(A.x + ux * t), Math.round(A.y + uy * t), level);
    this.insert(s1, t, node);
    this.insert(s2, u, node);
  }

  /** Joins a node lying on a segment; on another level only where one of the roads ends. */
  private touch(node: number, s: number, sameLevel: boolean): boolean {
    const [a, b] = this.ofSegment(s);
    if (node === a || node === b) return true;
    const p = this.graph.point(node);
    const [A, B] = [this.graph.point(a), this.graph.point(b)];
    const t = footOf(A.x - p.x, A.y - p.y, B.x - p.x, B.y - p.y);
    if (Math.hypot(A.x + (B.x - A.x) * t - p.x, A.y + (B.y - A.y) * t - p.y) > JOIN) return false;
    const length = Math.hypot(B.x - A.x, B.y - A.y);
    const corner = t * length <= JOIN ? a : (1 - t) * length <= JOIN ? b : null;
    if (!sameLevel && !this.ends.has(node) && !(corner !== null && this.ends.has(corner))) {
      return false;
    }
    if (corner === null) this.insert(s, t, node);
    else this.graph.join(node, corner);
    return true;
  }

  private insert(segment: number, t: number, node: number): void {
    const extra = this.inserted.get(segment);
    if (!extra) this.inserted.set(segment, [{ t, node }]);
    else if (!extra.some((other) => other.node === node)) extra.push({ t, node });
  }
}

/** Share of the segment a-b nearest to the origin. */
function footOf(ax: number, ay: number, bx: number, by: number): number {
  const [dx, dy] = [bx - ax, by - ay];
  return Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
}

/** The parts of a line inside the square 0 to extent. */
function clip(points: readonly TilePoint[], extent: number): TilePoint[][] {
  const parts: TilePoint[][] = [];
  let part: TilePoint[] | null = null;
  for (let i = 1; i < points.length; i++) {
    const [p, q] = [points[i - 1], points[i]];
    const [dx, dy] = [q.x - p.x, q.y - p.y];
    let t0 = 0;
    let t1 = 1;
    for (const [d, room] of [
      [-dx, p.x],
      [dx, extent - p.x],
      [-dy, p.y],
      [dy, extent - p.y],
    ]) {
      if (d < 0) t0 = Math.max(t0, room / d);
      else if (d > 0) t1 = Math.min(t1, room / d);
      else if (room < 0) t0 = Infinity;
    }
    if (t0 > t1) {
      part = null;
      continue;
    }
    if (!part || t0 > 0) parts.push((part = [{ x: p.x + dx * t0, y: p.y + dy * t0 }]));
    part.push({ x: p.x + dx * t1, y: p.y + dy * t1 });
    if (t1 < 1) part = null;
  }
  return parts;
}

/** Priority queue, smallest key first. */
class Heap {
  private readonly keys: number[] = [];
  private readonly nodes: number[] = [];
  lastKey = 0;

  push(node: number, key: number): void {
    let i = this.keys.length;
    this.keys.push(key);
    this.nodes.push(node);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= key) break;
      this.keys[i] = this.keys[parent];
      this.nodes[i] = this.nodes[parent];
      i = parent;
    }
    this.keys[i] = key;
    this.nodes[i] = node;
  }

  /** -1 if empty */
  pop(): number {
    if (!this.keys.length) return -1;
    const top = this.nodes[0];
    this.lastKey = this.keys[0];
    const key = this.keys.pop()!;
    const node = this.nodes.pop()!;
    const size = this.keys.length;
    if (!size) return top;
    let i = 0;
    for (let child = 1; child < size; child = i * 2 + 1) {
      if (child + 1 < size && this.keys[child + 1] < this.keys[child]) child++;
      if (this.keys[child] >= key) break;
      this.keys[i] = this.keys[child];
      this.nodes[i] = this.nodes[child];
      i = child;
    }
    this.keys[i] = key;
    this.nodes[i] = node;
    return top;
  }
}
