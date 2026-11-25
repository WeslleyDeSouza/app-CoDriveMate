import earcut from 'earcut';
import { EnvironmentData, LonLat, METRES_PER_DEGREE_LAT, metresPerDegreeLon } from './environment';

/** Triangles ready for the GPU. Metres, x = east, y = up, z = south. */
export interface MeshData {
  readonly position: Float32Array;
  readonly normal: Float32Array;
  readonly index: Uint32Array;
  readonly color?: Float32Array;
}

/** Surroundings of a cell, relative to its centre. */
export interface WorldGeometry {
  readonly sidewalks: MeshData;
  readonly roads: MeshData;
  readonly lines: MeshData;
  /** edge lines and zebra crossings */
  readonly markings: MeshData;
  readonly buildings: MeshData;
  /** x, z, height per tree */
  readonly trees: Float32Array;
}

export type Flat = readonly [x: number, z: number];

const ROAD_WIDTH: Record<string, number> = {
  motorway: 12,
  trunk: 10,
  primary: 9,
  secondary: 8,
  tertiary: 7,
  minor: 6,
  service: 4,
  pedestrian: 5,
  motorway_link: 5.5,
  trunk_link: 5.5,
  primary_link: 5.5,
  secondary_link: 5,
  tertiary_link: 5,
};
const MAX_BUILDINGS = 1500;
const MAX_TREES = 2500;
const FOREST_GRID_M = 9;
/** Long strips are divided, so that they can follow the terrain. */
const RIBBON_STEP_M = 5;
const RIBBON_COLUMN_M = 3;
const EDGE_STEP_M = 4;
const WHITE = linear(0xe8e8e2);
/** Swiss zebra crossings are yellow. */
const YELLOW = linear(0xe6b422);
const WALLS = [0xece5d8, 0xe0d8ca, 0xf3efe7, 0xd8cdbd, 0xe6e1da].map(linear);
const ROOFS = [0x9b4a36, 0xa95c42, 0x8a3f2e, 0x7c8189, 0x6d7078, 0xb06a4a].map(linear);

/** Collects triangles; all faces are seen from their normal's side. */
class MeshBuilder {
  private readonly position: number[] = [];
  private readonly normal: number[] = [];
  private readonly index: number[] = [];
  private readonly color: number[] = [];

  get size(): number {
    return this.position.length / 3;
  }

  vertex(
    x: number,
    y: number,
    z: number,
    normal: readonly number[] = UP,
    color?: readonly number[],
  ): number {
    this.position.push(x, y, z);
    this.normal.push(...normal);
    if (color) this.color.push(...color);
    return this.size - 1;
  }

  triangle(a: number, b: number, c: number): void {
    this.index.push(a, b, c);
  }

  /** A triangle lying flat, turned so that it faces up. */
  flat(a: number, b: number, c: number): void {
    const p = this.position;
    const cross =
      (p[b * 3 + 2] - p[a * 3 + 2]) * (p[c * 3] - p[a * 3]) -
      (p[b * 3] - p[a * 3]) * (p[c * 3 + 2] - p[a * 3 + 2]);
    if (cross >= 0) this.triangle(a, b, c);
    else this.triangle(a, c, b);
  }

  build(): MeshData {
    return {
      position: new Float32Array(this.position),
      normal: new Float32Array(this.normal),
      index: new Uint32Array(this.index),
      ...(this.color.length ? { color: new Float32Array(this.color) } : {}),
    };
  }
}

const UP = [0, 1, 0];

/** A strip of constant width along a line. */
export function ribbon(points: readonly Flat[], width: number, y: number): MeshData {
  const mesh = new MeshBuilder();
  addRibbon(mesh, points, width, y);
  return mesh.build();
}

export function buildWorld(data: EnvironmentData): WorldGeometry {
  const kx = metresPerDegreeLon(data.center[1]);
  const local = ([lon, lat]: LonLat): Flat => [
    (lon - data.center[0]) * kx,
    -(lat - data.center[1]) * METRES_PER_DEGREE_LAT,
  ];
  const sidewalks = new MeshBuilder();
  const roads = new MeshBuilder();
  const lines = new MeshBuilder();
  const strips: Strip[] = [];
  for (const road of data.roads) {
    const points = road.points.map(local);
    const usual = ROAD_WIDTH[road.kind] ?? 5;
    const width = road.lanes >= 2 ? Math.max(usual, road.lanes * 3.2) : usual;
    addRibbon(sidewalks, points, width + 3, 0.004);
    addRibbon(roads, points, width, 0.012);
    addDisc(roads, points[0], width / 2, 0.012);
    addDisc(roads, points[points.length - 1], width / 2, 0.012);
    strips.push({ points, width });
    if (width >= 6 && !road.oneway) {
      for (const dash of dashes(points, 3, 6)) addRibbon(lines, dash, 0.15, 0.02);
    }
  }
  const buildings = new MeshBuilder();
  for (const building of data.buildings.slice(0, MAX_BUILDINGS)) {
    addBuilding(buildings, building.outline.map(local), building.heightM);
  }
  return {
    sidewalks: sidewalks.build(),
    roads: roads.build(),
    lines: lines.build(),
    markings: markRoads(strips, (data.crossings ?? []).map(local)),
    buildings: buildings.build(),
    trees: plantTrees(data, local),
  };
}

interface Strip {
  readonly points: readonly Flat[];
  readonly width: number;
}

interface Segment {
  readonly a: Flat;
  readonly b: Flat;
  readonly width: number;
  readonly strip: Strip;
}

const SEGMENT_CELL_M = 30;

/** Segments by place, so that neighbours are found without trying all of them. */
class SegmentIndex {
  private readonly cells = new Map<string, Segment[]>();

  add(segment: Segment): void {
    const { a, b } = segment;
    const cell = (v: number) => Math.floor(v / SEGMENT_CELL_M);
    for (let x = cell(Math.min(a[0], b[0])) - 1; x <= cell(Math.max(a[0], b[0])) + 1; x++) {
      for (let z = cell(Math.min(a[1], b[1])) - 1; z <= cell(Math.max(a[1], b[1])) + 1; z++) {
        const key = x + '/' + z;
        const list = this.cells.get(key);
        if (list) list.push(segment);
        else this.cells.set(key, [segment]);
      }
    }
  }

  near([x, z]: Flat): readonly Segment[] {
    const key = Math.floor(x / SEGMENT_CELL_M) + '/' + Math.floor(z / SEGMENT_CELL_M);
    return this.cells.get(key) ?? [];
  }
}

function distanceTo({ a, b }: Segment, [x, z]: Flat): number {
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
  const t = ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1);
  const c = Math.max(0, Math.min(1, t));
  return Math.hypot(x - a[0] - dx * c, z - a[1] - dz * c);
}

function markRoads(strips: readonly Strip[], crossings: readonly Flat[]): MeshData {
  const mesh = new MeshBuilder();
  const index = new SegmentIndex();
  for (const strip of strips) {
    for (let i = 1; i < strip.points.length; i++) {
      const [a, b] = [strip.points[i - 1], strip.points[i]];
      index.add({ a, b, width: strip.width, strip });
    }
  }
  for (const strip of strips) {
    if (strip.width < 6) continue;
    const points = divide(strip.points, EDGE_STEP_M);
    for (const side of [-1, 1]) {
      const edge = offset(points, side * (strip.width / 2 - 0.25));
      for (let i = 1; i < edge.length; i++) {
        const middle: Flat = [(edge[i - 1][0] + edge[i][0]) / 2, (edge[i - 1][1] + edge[i][1]) / 2];
        // No line across the mouth of another road.
        const crossed = index
          .near(middle)
          .some((s) => s.strip !== strip && distanceTo(s, middle) < s.width / 2);
        if (!crossed) addRibbon(mesh, [edge[i - 1], edge[i]], 0.12, 0.022, WHITE);
      }
    }
  }
  for (const at of crossings) {
    const road = [...index.near(at)].sort((p, q) => distanceTo(p, at) - distanceTo(q, at))[0];
    if (!road || road.width < 5 || distanceTo(road, at) > road.width) continue;
    const length = Math.hypot(road.b[0] - road.a[0], road.b[1] - road.a[1]);
    if (length < 0.01) continue;
    const [ux, uz] = [(road.b[0] - road.a[0]) / length, (road.b[1] - road.a[1]) / length];
    for (let s = -road.width / 2 + 0.5; s <= road.width / 2 - 0.5; s += 1) {
      const [x, z] = [at[0] - uz * s, at[1] + ux * s];
      const stripe: Flat[] = [
        [x - ux * 2, z - uz * 2],
        [x + ux * 2, z + uz * 2],
      ];
      addRibbon(mesh, stripe, 0.5, 0.024, YELLOW);
    }
  }
  return mesh.build();
}

function offset(points: readonly Flat[], distance: number): Flat[] {
  return points.map(([x, z], i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [x - ((b[1] - a[1]) / length) * distance, z + ((b[0] - a[0]) / length) * distance];
  });
}

/** The same line with no piece longer than `step`. */
function divide(points: readonly Flat[], step: number): Flat[] {
  const result: Flat[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const pieces = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 1; k <= pieces; k++) {
      result.push([ax + ((bx - ax) * k) / pieces, az + ((bz - az) * k) / pieces]);
    }
  }
  return result;
}

function addRibbon(
  mesh: MeshBuilder,
  line: readonly Flat[],
  width: number,
  y: number,
  color?: readonly number[],
): void {
  if (line.length < 2) return;
  const points = divide(line, RIBBON_STEP_M);
  const first = mesh.size;
  const columns = Math.max(1, Math.ceil(width / RIBBON_COLUMN_M));
  points.forEach(([x, z], i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const sx = (-(b[1] - a[1]) / length) * (width / 2);
    const sz = ((b[0] - a[0]) / length) * (width / 2);
    for (let c = 0; c <= columns; c++) {
      const side = 1 - (2 * c) / columns;
      mesh.vertex(x + sx * side, y, z + sz * side, UP, color);
    }
  });
  const row = columns + 1;
  for (let i = 0; i < points.length - 1; i++) {
    for (let c = 0; c < columns; c++) {
      const a = first + i * row + c;
      mesh.flat(a, a + row, a + 1);
      mesh.flat(a + 1, a + row, a + row + 1);
    }
  }
}

function addDisc(mesh: MeshBuilder, [x, z]: Flat, radius: number, y: number): void {
  const center = mesh.vertex(x, y, z);
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    mesh.vertex(x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius);
  }
  for (let i = 1; i <= steps; i++) mesh.flat(center, center + i, center + i + 1);
}

/** Pieces of a line for a dashed centre line. */
export function dashes(points: readonly Flat[], on: number, off: number): Flat[][] {
  const result: Flat[][] = [];
  let travelled = 0;
  let current: Flat[] | null = null;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const length = Math.hypot(bx - ax, bz - az);
    const at = (t: number): Flat => [ax + ((bx - ax) * t) / length, az + ((bz - az) * t) / length];
    let t = 0;
    while (length - t > 1e-6) {
      const phase = travelled % (on + off);
      const drawing = phase < on - 1e-6;
      // Never a zero step, or rounding could keep the loop from ending.
      const step = Math.min(length - t, Math.max(0.01, drawing ? on - phase : on + off - phase));
      if (drawing) {
        if (!current) result.push((current = [at(t)]));
        current.push(at(t + step));
      } else {
        current = null;
      }
      t += step;
      travelled += step;
    }
  }
  return result;
}

function addBuilding(mesh: MeshBuilder, outline: Flat[], height: number): void {
  const ring = [...outline];
  const [first, last] = [ring[0], ring[ring.length - 1]];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.01) ring.pop();
  if (ring.length < 3) return;
  let area = 0;
  ring.forEach(([x, z], i) => {
    const [nx, nz] = ring[(i + 1) % ring.length];
    area += x * nz - nx * z;
  });
  if (Math.abs(area) < 1) return;
  if (area < 0) ring.reverse();

  const seed = Math.abs(Math.round(first[0] * 7 + first[1] * 13));
  const wall = WALLS[seed % WALLS.length];
  const roof = ROOFS[(seed >> 2) % ROOFS.length];
  ring.forEach(([ax, az], i) => {
    const [bx, bz] = ring[(i + 1) % ring.length];
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 0.01) return;
    const normal = [(bz - az) / length, 0, -(bx - ax) / length];
    const shade = 0.82 + 0.18 * Math.abs(normal[0]);
    const color = wall.map((c) => c * shade);
    const a = mesh.vertex(ax, 0, az, normal, color);
    const b = mesh.vertex(bx, 0, bz, normal, color);
    const bTop = mesh.vertex(bx, height, bz, normal, color);
    const aTop = mesh.vertex(ax, height, az, normal, color);
    mesh.triangle(a, bTop, b);
    mesh.triangle(a, aTop, bTop);
  });
  const base = mesh.size;
  for (const [x, z] of ring) mesh.vertex(x, height, z, UP, roof);
  const triangles = earcut(ring.flat());
  for (let i = 0; i < triangles.length; i += 3) {
    mesh.flat(base + triangles[i], base + triangles[i + 1], base + triangles[i + 2]);
  }
}

function plantTrees(data: EnvironmentData, local: (p: LonLat) => Flat): Float32Array {
  const trees: number[] = [];
  const full = () => trees.length >= MAX_TREES * 3;
  for (const tree of data.trees) {
    if (full()) break;
    const [x, z] = local(tree.at);
    trees.push(x, z, tree.heightM || 7 + (Math.abs(Math.round(x * 3 + z * 5)) & 3));
  }
  for (const forest of data.forests) {
    const ring = forest.map(local);
    const clamp = (v: number) => Math.max(-500, Math.min(500, v));
    const xs = ring.map((p) => p[0]);
    const zs = ring.map((p) => p[1]);
    const [x0, x1] = [clamp(Math.min(...xs)), clamp(Math.max(...xs))];
    const [z0, z1] = [clamp(Math.min(...zs)), clamp(Math.max(...zs))];
    for (let x = x0; x < x1 && !full(); x += FOREST_GRID_M) {
      for (let z = z0; z < z1 && !full(); z += FOREST_GRID_M) {
        // Shifted off the grid, always the same way for the same place.
        const jx = x + ((x * 13.1 + z * 7.3) % 4);
        const jz = z + ((x * 5.7 + z * 11.9) % 4);
        if (inside(ring, jx, jz)) trees.push(jx, jz, 10 + Math.abs((jx * 3 + jz) % 6));
      }
    }
  }
  return new Float32Array(trees);
}

function inside(ring: readonly Flat[], x: number, z: number): boolean {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[j];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) result = !result;
  }
  return result;
}

/** sRGB hex colour as linear components, as vertex colours need them. */
function linear(hex: number): number[] {
  return [16, 8, 0].map((shift) => {
    const c = ((hex >> shift) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
}
