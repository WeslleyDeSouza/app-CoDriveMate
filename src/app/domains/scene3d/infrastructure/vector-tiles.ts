import {
  Building,
  EnvironmentData,
  LonLat,
  Road,
  Street,
  isWithin,
  tileCorner,
} from '../domain/environment';

/** What is used of a vector tile; `@mapbox/vector-tile` fits. */
export interface TileFeature {
  readonly properties: Readonly<Record<string, string | number | boolean>>;
  /** 1 point, 2 line, 3 polygon */
  readonly type: number;
  loadGeometry(): { x: number; y: number }[][];
}

export interface TileLayer {
  readonly extent: number;
  readonly length: number;
  feature(index: number): TileFeature;
}

export interface DecodedTile {
  readonly x: number;
  readonly y: number;
  readonly layers: Readonly<Record<string, TileLayer | undefined>>;
}

export const VECTOR_ZOOM = 14;
export const ROAD_RADIUS_M = 650;
const BUILDING_RADIUS_M = 450;
const ROAD_CLASSES = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'minor',
  'service',
]);

/** Surroundings of a cell from OpenMapTiles vector tiles. */
export function environmentFromTiles(
  tiles: readonly DecodedTile[],
  center: LonLat,
): EnvironmentData {
  const roads: Road[] = [];
  const streets: Street[] = [];
  const buildings: Building[] = [];
  const forests: LonLat[][] = [];

  for (const tile of tiles) {
    each(tile, 'transportation', ROAD_RADIUS_M, center, (properties, lines, type) => {
      const kind = String(properties['class']);
      const pedestrian = properties['subclass'] === 'pedestrian';
      if (type !== 2 || properties['brunnel'] === 'tunnel') return;
      if (!pedestrian && !ROAD_CLASSES.has(kind)) return;
      for (const points of lines) {
        roads.push({
          kind: pedestrian ? 'pedestrian' : properties['ramp'] === 1 ? kind + '_link' : kind,
          lanes: 0,
          oneway: properties['oneway'] === 1,
          points,
        });
      }
    });
    each(tile, 'transportation_name', ROAD_RADIUS_M, center, (properties, lines, type) => {
      const name = String(properties['name'] ?? properties['ref'] ?? '');
      if (type !== 2 || !name || !ROAD_CLASSES.has(String(properties['class']))) return;
      for (const points of lines) streets.push({ name, points });
    });
    each(tile, 'building', BUILDING_RADIUS_M, center, (properties, rings) => {
      if (properties['hide_3d']) return;
      const heightM = Math.min(250, Number(properties['render_height']) || 9);
      for (const outline of rings) buildings.push({ heightM, outline });
    });
    each(tile, 'landcover', ROAD_RADIUS_M, center, (properties, rings) => {
      if (properties['class'] === 'wood') forests.push(...rings);
    });
  }
  return { center, roads, streets, buildings, trees: [], forests };
}

function each(
  tile: DecodedTile,
  name: string,
  radiusM: number,
  center: LonLat,
  use: (properties: TileFeature['properties'], shapes: LonLat[][], type: number) => void,
): void {
  const layer = tile.layers[name];
  if (!layer) return;
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    const shapes = feature
      .loadGeometry()
      // Inner rings (courtyards) run the other way round; they are filled.
      .filter((ring) => feature.type !== 3 || signedArea(ring) > 0)
      .map((ring) =>
        ring.map((p): LonLat =>
          tileCorner(tile.x + p.x / layer.extent, tile.y + p.y / layer.extent, VECTOR_ZOOM),
        ),
      )
      .filter((points) => points.length > 1 && isWithin(points, center, radiusM));
    if (shapes.length) use(feature.properties, shapes, feature.type);
  }
}

function signedArea(ring: readonly { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j].x - ring[i].x) * (ring[i].y + ring[j].y);
  }
  return sum;
}
