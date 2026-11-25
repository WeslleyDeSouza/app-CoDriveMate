import { Coordinate, distanceM } from './geo';
import { progressOn } from './guidance';
import { MAX_ROAD_TILES, offlineRoute, tilesForRoute } from './offline-route';
import { NameLine, RoadGraph, RoadLine, RoadTile, tileAt, toCoordinate } from './road-graph';
import { NoRouteError } from './route';

// One unit is about 0.4 m, so 1000 units are about 404 m.
const X = 8580;
const Y = 5737;

const at = (x: number, y: number): Coordinate => toCoordinate({ x: X * 4096 + x, y: Y * 4096 + y });

type Points = [x: number, y: number][];
const pts = (points: Points) => points.map(([x, y]) => ({ x, y }));

function road(points: Points, more: Partial<RoadLine> = {}): RoadLine {
  return {
    kind: 'minor',
    ramp: false,
    oneway: 0,
    tunnel: false,
    level: 0,
    points: pts(points),
    ...more,
  };
}

function tile(roads: RoadLine[], names: Record<string, Points> = {}, x = X, y = Y): RoadTile {
  const lines = Object.entries(names).map(([name, points]): NameLine => ({
    name,
    kind: 'minor',
    points: pts(points),
  }));
  return { x, y, extent: 4096, roads, names: () => lines };
}

const turns = (tiles: RoadTile[], from: Coordinate, to: Coordinate) =>
  offlineRoute(tiles, from, to).steps.map(({ maneuver, street }) =>
    [maneuver.type, maneuver.modifier, maneuver.exit, street].filter(Boolean).join(' '),
  );

describe('offline route', () => {
  const cross = tile(
    [
      road([
        [500, 1000],
        [3500, 1000],
      ]),
      // Crosses without a shared point, as simplified lines do.
      road([
        [2000, 200],
        [2000, 3000],
      ]),
    ],
    {
      Längs: [
        [500, 1000],
        [3500, 1000],
      ],
      Quer: [
        [2000, 200],
        [2000, 3000],
      ],
    },
  );

  it('turns right at a crossing, with street names', () => {
    const route = offlineRoute([cross], at(600, 1010), at(2000, 2900));
    expect(route.provider).toBe('osm');
    expect(route.delayS).toBe(0);
    expect(turns([cross], at(600, 1010), at(2000, 2900))).toEqual([
      'depart Längs',
      'turn right Quer',
      'arrive',
    ]);
    expect(route.line.lengthM).toBeGreaterThan(1300);
    expect(route.line.lengthM).toBeLessThan(1350);
    expect(route.steps[2].alongM).toBe(route.line.lengthM);
    // 1.3 km at 25 km/h and one turn
    expect(Math.abs(route.durationS - 200)).toBeLessThan(10);
    const progress = progressOn(route, at(1000, 1000));
    expect(progress.next.street).toBe('Quer');
    expect(progress.street).toBe('Längs');
  });

  it('turns left, and goes straight without a word', () => {
    expect(turns([cross], at(600, 1000), at(2000, 300))[1]).toBe('turn left Quer');
    expect(turns([cross], at(600, 1000), at(3400, 1000))).toEqual(['depart Längs', 'arrive']);
  });

  it('starts and ends on the same road, in both directions', () => {
    const route = offlineRoute([cross], at(1500, 1000), at(600, 1000));
    expect(distanceM(route.line.points[0], at(1500, 1000))).toBeLessThan(1);
    expect(Math.abs(route.line.lengthM - 364)).toBeLessThan(5);
  });

  it('says a new street name on a straight road', () => {
    const two = tile(cross.roads.slice(), {
      Anfang: [
        [500, 1000],
        [2000, 1000],
      ],
      Ende: [
        [2000, 1000],
        [3500, 1000],
      ],
    });
    expect(turns([two], at(600, 1000), at(3400, 1000))).toEqual([
      'depart Anfang',
      'new name straight Ende',
      'arrive',
    ]);
  });

  it('follows one-way roads only in their direction', () => {
    const block = (oneway: 0 | 1 | -1) =>
      tile([
        road(
          [
            [1000, 1000],
            [2000, 1000],
          ],
          { oneway },
        ),
        road([
          [1000, 1000],
          [1000, 2000],
          [2000, 2000],
          [2000, 1000],
        ]),
        road([
          [500, 1000],
          [1000, 1000],
        ]),
        road([
          [2000, 1000],
          [2500, 1000],
        ]),
      ]);
    const length = (oneway: 0 | 1 | -1, from: number, to: number) =>
      offlineRoute([block(oneway)], at(from, 1000), at(to, 1000)).line.lengthM;
    expect(length(1, 600, 2400)).toBeLessThan(760);
    expect(length(1, 2400, 600)).toBeGreaterThan(1400);
    expect(length(-1, 600, 2400)).toBeGreaterThan(1400);
    // A start on the one-way road cannot turn round.
    expect(length(1, 1500, 600)).toBeGreaterThan(1200);
    expect(length(0, 1500, 600)).toBeLessThan(400);
  });

  it('joins roads across a tile border and ignores the overlap', () => {
    const west = tile(
      [
        road([
          [3000, 1000],
          [4160, 1000],
        ]),
      ],
      {
        Grenzweg: [
          [3000, 1000],
          [4160, 1000],
        ],
      },
    );
    const east = tile(
      [
        // Cut a little differently, and with the overlap of its own.
        road([
          [-64, 1003],
          [1000, 1003],
        ]),
      ],
      {
        Grenzweg: [
          [-64, 1003],
          [1000, 1003],
        ],
      },
      X + 1,
    );
    expect(new RoadGraph([west, east]).edgeCount).toBe(2);
    expect(turns([west, east], at(3100, 1000), at(5000, 1000))).toEqual([
      'depart Grenzweg',
      'arrive',
    ]);
    expect(() => offlineRoute([west], at(3100, 1000), at(5000, 1000))).toThrow(NoRouteError);
  });

  it('does not join roads on different levels, but the end of a bridge', () => {
    const over = (level: number) =>
      tile([
        road([
          [500, 1000],
          [3500, 1000],
        ]),
        road(
          [
            [2000, 200],
            [2000, 1800],
          ],
          { level },
        ),
        road([
          [2000, 1800],
          [2000, 3000],
        ]),
      ]);
    expect(offlineRoute([over(0)], at(600, 1000), at(2000, 2900)).steps).toHaveLength(3);
    expect(() => offlineRoute([over(1)], at(600, 1000), at(2000, 2900))).toThrow(NoRouteError);
    expect(offlineRoute([over(1)], at(2000, 300), at(2000, 2900)).line.lengthM).toBeGreaterThan(
      1000,
    );
  });

  it('joins a road that ends next to the line of another', () => {
    const t = tile([
      road([
        [500, 1000],
        [3500, 1000],
      ]),
      road([
        [2000, 1001],
        [2000, 3000],
      ]),
    ]);
    expect(offlineRoute([t], at(600, 1000), at(2000, 2900)).steps).toHaveLength(3);
  });

  it('has no route without roads for cars, too far from a road or between islands', () => {
    const paths = tile([
      road(
        [
          [500, 1000],
          [3500, 1000],
        ],
        { kind: 'path' },
      ),
    ]);
    expect(() => offlineRoute([paths], at(600, 1000), at(3000, 1000))).toThrow(NoRouteError);
    expect(() => offlineRoute([], at(600, 1000), at(3000, 1000))).toThrow(NoRouteError);
    expect(() => offlineRoute([cross], at(600, 1000), at(3000, 2000))).toThrow(NoRouteError);
    const islands = tile([
      road([
        [0, 1000],
        [500, 1000],
      ]),
      road([
        [3000, 1000],
        [3500, 1000],
      ]),
    ]);
    expect(() => offlineRoute([islands], at(100, 1000), at(3400, 1000))).toThrow(NoRouteError);
  });

  it('leaves an island next to the start out', () => {
    const t = tile([
      ...cross.roads,
      road(
        [
          [700, 1100],
          [800, 1100],
        ],
        { kind: 'service' },
      ),
    ]);
    expect(offlineRoute([t], at(750, 1100), at(3400, 1000)).line.lengthM).toBeGreaterThan(1000);
  });

  it('drives roundabouts to the left and counts the exits', () => {
    const ring: Points = [];
    for (let i = 0; i <= 16; i++) {
      const angle = (i / 16) * 2 * Math.PI;
      ring.push([Math.round(2000 + 50 * Math.cos(angle)), Math.round(2000 + 50 * Math.sin(angle))]);
    }
    const t = tile([
      // Not marked as one-way and drawn clockwise.
      road(ring),
      road([
        [1000, 2000],
        [1950, 2000],
      ]),
      road([
        [2050, 2000],
        [3000, 2000],
      ]),
      road([
        [2000, 1000],
        [2000, 1950],
      ]),
      road([
        [2000, 2050],
        [2000, 3000],
      ]),
    ]);
    const step = (x: number, y: number) => offlineRoute([t], at(1100, 2000), at(x, y)).steps[1];
    expect(step(2000, 2900).maneuver).toEqual({ type: 'roundabout', modifier: 'right', exit: 1 });
    expect(step(2900, 2000).maneuver.exit).toBe(2);
    expect(step(2000, 1100).maneuver).toEqual({ type: 'roundabout', modifier: 'left', exit: 3 });
    expect(offlineRoute([t], at(1100, 2000), at(2000, 1100)).steps).toHaveLength(3);
  });

  it('names ramps of motorways', () => {
    const t = tile([
      road(
        [
          [100, 1000],
          [3900, 1000],
        ],
        { kind: 'motorway', oneway: 1 },
      ),
      road(
        [
          [1000, 1000],
          [1400, 1100],
          [1600, 1500],
        ],
        { kind: 'motorway', ramp: true, oneway: 1 },
      ),
      road([
        [1000, 1500],
        [3000, 1500],
      ]),
      road(
        [
          [2000, 1500],
          [2400, 1100],
          [2800, 1000],
        ],
        { kind: 'motorway', ramp: true, oneway: 1 },
      ),
    ]);
    const off = turns([t], at(200, 1000), at(2900, 1500));
    expect(off[1]).toBe('off ramp slight right');
    const on = turns([t], at(1100, 1500), at(3800, 1000));
    expect(on.map((step) => step.split(' ')[0])).toEqual(['depart', 'on', 'merge', 'arrive']);
  });

  it('is fast enough on a large network', () => {
    const roads: RoadLine[] = [];
    for (let i = 0; i < 100; i++) {
      const c = 20 + i * 40;
      roads.push(
        road([
          [20, c],
          [3980, c],
        ]),
        road([
          [c, 20],
          [c, 3980],
        ]),
      );
    }
    const started = performance.now();
    const route = offlineRoute([tile(roads)], at(20, 25), at(3980, 3970));
    expect(performance.now() - started).toBeLessThan(5000);
    expect(new RoadGraph([tile(roads)]).edgeCount).toBe(2 * 100 * 99);
    expect(Math.abs(route.line.lengthM - 3190)).toBeLessThan(30);
  });
});

describe('tiles for a route', () => {
  it('cover both ends and a margin, never too many', () => {
    const [from, to]: Coordinate[] = [
      [8.5402, 47.3782],
      [8.724, 47.5],
    ];
    const tiles = tilesForRoute(from, to);
    expect(tiles).toContainEqual(tileAt(from));
    expect(tiles).toContainEqual(tileAt(to));
    expect(tilesForRoute(from, from)).toHaveLength(49);
    const far = tilesForRoute(from, [7.6, 47.56]);
    expect(far).toHaveLength(MAX_ROAD_TILES);
    expect(far).toContainEqual(tileAt([7.6, 47.56]));
    expect(() => tilesForRoute(from, [6.14, 46.2])).toThrow(NoRouteError);
  });
});
