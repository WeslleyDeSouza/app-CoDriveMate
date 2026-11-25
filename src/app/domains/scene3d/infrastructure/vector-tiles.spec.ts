import { LonLat, tileCorner, tileOf } from '../domain/environment';
import { DecodedTile, TileFeature, VECTOR_ZOOM, environmentFromTiles } from './vector-tiles';

const HERE: LonLat = [8.54, 47.38];
const { x, y } = tileOf(HERE, VECTOR_ZOOM);
const EXTENT = 4096;
const [west, north] = tileCorner(x, y, VECTOR_ZOOM);
const [east, south] = tileCorner(x + 1, y + 1, VECTOR_ZOOM);
/** Tile coordinates of the cell centre. */
const cx = ((HERE[0] - west) / (east - west)) * EXTENT;
const cy = ((HERE[1] - north) / (south - north)) * EXTENT;

type Ring = [number, number][];
const feature = (
  type: number,
  properties: TileFeature['properties'],
  ...rings: Ring[]
): TileFeature => ({
  type,
  properties,
  loadGeometry: () => rings.map((ring) => ring.map(([dx, dy]) => ({ x: cx + dx, y: cy + dy }))),
});
const tile = (layers: Record<string, TileFeature[]>): DecodedTile => ({
  x,
  y,
  layers: Object.fromEntries(
    Object.entries(layers).map(([name, features]) => [
      name,
      { extent: EXTENT, length: features.length, feature: (i: number) => features[i] },
    ]),
  ),
});
const line: Ring = [
  [0, 0],
  [50, 0],
];
const outer: Ring = [
  [0, 0],
  [40, 0],
  [40, 40],
  [0, 40],
  [0, 0],
];
const inner: Ring = [...outer].reverse();

describe('environmentFromTiles', () => {
  it('reads roads and leaves out tunnels, rails and paths', () => {
    const { roads } = environmentFromTiles(
      [
        tile({
          transportation: [
            feature(2, { class: 'primary', oneway: 1 }, line),
            feature(2, { class: 'motorway', ramp: 1 }, line),
            feature(2, { class: 'path', subclass: 'pedestrian' }, line),
            feature(2, { class: 'primary', brunnel: 'tunnel' }, line),
            feature(2, { class: 'rail' }, line),
            feature(2, { class: 'path' }, line),
          ],
        }),
      ],
      HERE,
    );
    expect(roads.map((r) => [r.kind, r.oneway])).toEqual([
      ['primary', true],
      ['motorway_link', false],
      ['pedestrian', false],
    ]);
    expect(roads[0].points[0][0]).toBeCloseTo(HERE[0], 4);
    expect(roads[0].points[0][1]).toBeCloseTo(HERE[1], 4);
  });

  it('reads street names, buildings with height and forests', () => {
    const data = environmentFromTiles(
      [
        tile({
          transportation_name: [
            feature(2, { class: 'minor', name: 'Mühlegasse' }, line),
            feature(2, { class: 'minor' }, line),
          ],
          building: [
            feature(3, { render_height: 21 }, outer, inner),
            feature(3, {}, outer),
            feature(3, { hide_3d: true }, outer),
          ],
          landcover: [feature(3, { class: 'wood' }, outer), feature(3, { class: 'grass' }, outer)],
        }),
      ],
      HERE,
    );
    expect(data.streets.map((s) => s.name)).toEqual(['Mühlegasse']);
    // the courtyard of the first building is not a building of its own
    expect(data.buildings.map((b) => b.heightM)).toEqual([21, 9]);
    expect(data.forests).toHaveLength(1);
  });

  it('keeps only what is near the cell and copes with empty tiles', () => {
    const far: Ring = [
      [3000, 3000],
      [3040, 3000],
      [3040, 3040],
    ];
    const data = environmentFromTiles([tile({ building: [feature(3, {}, far)] }), tile({})], HERE);
    expect(data.buildings).toEqual([]);
  });
});
