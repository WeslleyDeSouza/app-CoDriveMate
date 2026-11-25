import { activeMode, cameraView, nextCameraMode, turnTowards } from './camera';
import {
  EnvironmentData,
  LonLat,
  METRES_PER_DEGREE_LAT,
  ahead,
  cellKey,
  cellOf,
  detailsQuery,
  hasAerialImages,
  isWithin,
  parseDetails,
  pointsAlong,
  roadNameAt,
  tileCorner,
  tileOf,
  tilesAround,
} from './environment';
import { Flat, MeshData, buildWorld, dashes, ribbon } from './world-geometry';

const ZURICH: LonLat = [8.54, 47.38];
const M = 1 / METRES_PER_DEGREE_LAT;

/** Geometric normal of every triangle, to compare with the stored one. */
function facing(mesh: MeshData): boolean {
  const p = mesh.position;
  for (let i = 0; i < mesh.index.length; i += 3) {
    const [a, b, c] = mesh.index.subarray(i, i + 3);
    const u = [0, 1, 2].map((k) => p[b * 3 + k] - p[a * 3 + k]);
    const v = [0, 1, 2].map((k) => p[c * 3 + k] - p[a * 3 + k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const dot = [0, 1, 2].reduce((sum, k) => sum + n[k] * mesh.normal[a * 3 + k], 0);
    if (dot < 0) return false;
  }
  return mesh.index.length > 0;
}

const square = (reverse: boolean): LonLat[] => {
  const ring: LonLat[] = [
    [8.54, 47.38],
    [8.5402, 47.38],
    [8.5402, 47.3802],
    [8.54, 47.3802],
    [8.54, 47.38],
  ];
  return reverse ? ring.reverse() : ring;
};

const world = (part: Partial<EnvironmentData>): EnvironmentData => ({
  center: ZURICH,
  roads: [],
  streets: [],
  buildings: [],
  trees: [],
  forests: [],
  ...part,
});

describe('grid', () => {
  it('puts points in stable cells', () => {
    expect(cellKey(cellOf([8.5412, 47.3769]))).toBe('47.3767_8.5400');
    expect(cellOf(cellOf([8.5412, 47.3769]))).toEqual(cellOf([8.5412, 47.3769]));
  });

  it('looks ahead in driving direction', () => {
    const north = ahead(ZURICH, 0, 250);
    expect(north[0]).toBeCloseTo(8.54, 8);
    expect((north[1] - 47.38) / M).toBeCloseTo(250, 3);
    expect(ahead(ZURICH, 90, 250)[0]).toBeGreaterThan(8.543);
  });

  it('finds tiles and knows where aerial images exist', () => {
    const { x, y } = tileOf(ZURICH, 18);
    const [west, north] = tileCorner(x, y, 18);
    const [east, south] = tileCorner(x + 1, y + 1, 18);
    expect(west <= 8.54 && 8.54 < east && south < 47.38 && 47.38 <= north).toBe(true);
    expect(hasAerialImages(ZURICH)).toBe(true);
    expect(hasAerialImages([2.35, 48.85])).toBe(false);
  });
});

describe('trees and crossings', () => {
  it('asks around the cell', () => {
    expect(detailsQuery(ZURICH)).toContain('around:480,47.38000,8.54000');
  });

  it('reads both and rejects anything else', () => {
    const node = (tags: Record<string, string>) => ({ lat: 47.38, lon: 8.54, tags });
    expect(
      parseDetails({
        elements: [
          node({ natural: 'tree', height: '12,5 m' }),
          node({ highway: 'crossing' }),
          node({ highway: 'crossing', crossing: 'unmarked' }),
          {},
        ],
      }),
    ).toEqual({ trees: [{ at: ZURICH, heightM: 12.5 }], crossings: [ZURICH] });
    expect(parseDetails('<html>')).toBeNull();
    expect(parseDetails(null)).toBeNull();
    expect(parseDetails({ elements: [], remark: 'timed out' })).toBeNull();
    expect(parseDetails({ elements: [] })).toEqual({ trees: [], crossings: [] });
  });
});

describe('along a line', () => {
  it('samples at equal distances across corners', () => {
    const line: LonLat[] = [
      [8.54, 47.38],
      [8.54, 47.38 + 100 * M],
      [8.54, 47.38 + 250 * M],
    ];
    expect(pointsAlong(line, 80).map(([, lat]) => Math.round((lat - 47.38) / M))).toEqual([
      0, 80, 160, 240, 250,
    ]);
    expect(pointsAlong([], 80)).toEqual([]);
  });

  it('finds shapes and tiles around a point', () => {
    expect(
      isWithin(
        [
          [8.54, 47.39],
          [8.54, 47.37],
        ],
        ZURICH,
        100,
      ),
    ).toBe(true);
    expect(
      isWithin(
        [
          [8.56, 47.39],
          [8.56, 47.37],
        ],
        ZURICH,
        100,
      ),
    ).toBe(false);
    expect(tilesAround(ZURICH, 10, 14)).toContainEqual(tileOf(ZURICH, 14));
    expect(tilesAround(ZURICH, 3000, 14).length).toBeGreaterThan(8);
  });
});

describe('roadNameAt', () => {
  const road = (name: string, points: LonLat[]) => ({ name, points });
  const data = world({
    streets: [
      road('Nordweg', [
        [8.54, 47.379],
        [8.54, 47.381],
      ]),
      road('Querweg', [
        [8.539, 47.38003],
        [8.541, 47.38003],
      ]),
    ],
  });

  it('prefers the road in driving direction at a crossing', () => {
    const at: LonLat = [8.54006, 47.38003];
    expect(roadNameAt(data, at, 0, true)).toBe('Nordweg');
    expect(roadNameAt(data, at, 180, true)).toBe('Nordweg');
    expect(roadNameAt(data, at, 90, true)).toBe('Querweg');
    expect(roadNameAt(data, at, 0, false)).toBe('Querweg');
  });

  it('is empty away from any road', () => {
    expect(roadNameAt(data, [8.55, 47.39], 0, true)).toBe('');
  });
});

describe('world geometry', () => {
  it('turns every face outwards, whatever the direction of the outline', () => {
    for (const reverse of [false, true]) {
      const { buildings } = buildWorld(
        world({ buildings: [{ heightM: 10, outline: square(reverse) }] }),
      );
      expect(facing(buildings)).toBe(true);
      // 4 walls with 2 triangles, 2 triangles for the roof
      expect(buildings.index.length / 3).toBe(10);
      expect(buildings.color?.length).toBe(buildings.position.length);
    }
  });

  it('draws roads facing up, with a dashed line only on wide two-way roads', () => {
    const road = (kind: string, oneway: boolean) =>
      buildWorld(
        world({
          roads: [{ kind, lanes: 0, oneway, points: [ZURICH, [8.541, 47.381]] }],
        }),
      );
    expect(facing(road('primary', false).roads)).toBe(true);
    expect(facing(road('primary', false).lines)).toBe(true);
    expect(road('primary', true).lines.index).toHaveLength(0);
    expect(road('service', false).lines.index).toHaveLength(0);
    expect(
      facing(
        ribbon(
          [
            [0, 0],
            [0, 50],
            [-50, 50],
          ],
          3,
          0,
        ),
      ),
    ).toBe(true);
  });

  it('marks edges of wide roads, but not across the mouth of another road', () => {
    const east: LonLat = [8.541, 47.38];
    const main = { kind: 'primary', lanes: 2, oneway: false, points: [ZURICH, east] };
    const side = {
      kind: 'minor',
      lanes: 0,
      oneway: false,
      points: [[8.5405, 47.38] as LonLat, [8.5405, 47.3802] as LonLat],
    };
    const alone = buildWorld(world({ roads: [main] })).markings;
    expect(facing(alone)).toBe(true);
    const bothEdges = alone.index.length;
    const mouth = buildWorld(world({ roads: [main, { ...side, kind: 'service' }] })).markings;
    expect(mouth.index.length).toBeLessThan(bothEdges);
  });

  it('paints crossings on the nearest road only', () => {
    const road = {
      kind: 'primary',
      lanes: 2,
      oneway: false,
      points: [ZURICH, [8.541, 47.38] as LonLat],
    };
    const count = (crossings: LonLat[]) =>
      buildWorld(world({ roads: [road], crossings })).markings.index.length;
    expect(count([[8.5405, 47.38]])).toBeGreaterThan(count([]));
    expect(count([[8.5405, 47.3805]])).toBe(count([]));
  });

  it('ignores degenerate outlines', () => {
    const { buildings } = buildWorld(
      world({
        buildings: [
          { heightM: 5, outline: [ZURICH, ZURICH, ZURICH] },
          { heightM: 5, outline: [ZURICH, [8.541, 47.38]] },
        ],
      }),
    );
    expect(buildings.index).toHaveLength(0);
  });

  it('splits a line into dashes across corners', () => {
    const line: Flat[] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    const result = dashes(line, 3, 6);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual([
      [0, 0],
      [3, 0],
    ]);
    // the second dash starts at 9 m and bends around the corner
    expect(result[1].map(([x, z]) => [Math.round(x), Math.round(z)])).toEqual([
      [9, 0],
      [10, 0],
      [10, 2],
    ]);
    expect(dashes([line[0], line[0]], 3, 6)).toEqual([]);
  });

  it('fills forests with a limited number of trees', () => {
    const big = (d: number): LonLat[] => [
      [8.54 - d, 47.38 - d],
      [8.54 + d, 47.38 - d],
      [8.54 + d, 47.38 + d],
      [8.54 - d, 47.38 + d],
    ];
    const some = buildWorld(world({ forests: [big(0.0005)] })).trees.length / 3;
    expect(some).toBeGreaterThan(20);
    expect(buildWorld(world({ forests: [big(0.02)] })).trees.length / 3).toBe(2500);
  });
});

describe('camera', () => {
  it('cycles through all modes', () => {
    expect(nextCameraMode('auto')).toBe('chase');
    expect(nextCameraMode('orbit')).toBe('auto');
  });

  it('shows the car from around after standing for a while', () => {
    expect(activeMode('auto', 3, false)).toBe('chase');
    expect(activeMode('auto', 7, false)).toBe('orbit');
    expect(activeMode('auto', 7, true)).toBe('chase');
    expect(activeMode('side', 99, false)).toBe('side');
  });

  it('moves back with speed', () => {
    const slow = cameraView('chase', 0, true, 0).position[2];
    expect(cameraView('chase', 40, true, 0).position[2]).toBeGreaterThan(slow);
  });

  it('turns the short way round', () => {
    expect(turnTowards(350, 10, 0.5)).toBeCloseTo(0, 5);
    expect(turnTowards(10, 350, 1)).toBeCloseTo(350, 5);
  });
});
