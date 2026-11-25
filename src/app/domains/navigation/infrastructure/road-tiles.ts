import { VectorTile, VectorTileLayer } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { NameLine, ROAD_KINDS, RoadLine, RoadTile } from '../domain/road-graph';

export interface RawTile {
  readonly x: number;
  readonly y: number;
  readonly bytes: ArrayBuffer;
}

const LINE = 2;
const KINDS = new Set(ROAD_KINDS);

/** Roads and names of an OpenMapTiles vector tile. */
export function roadTile({ x, y, bytes }: RawTile): RoadTile {
  const { layers } = new VectorTile(new PbfReader(new Uint8Array(bytes)));
  const roads = layers['transportation'] as VectorTileLayer | undefined;
  const names = layers['transportation_name'] as VectorTileLayer | undefined;
  return {
    x,
    y,
    extent: roads?.extent ?? 4096,
    roads: roads ? readRoads(roads) : [],
    names: () => (names ? readNames(names) : []),
  };
}

function readRoads(layer: VectorTileLayer): RoadLine[] {
  const result: RoadLine[] = [];
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    const p = feature.properties;
    const kind = String(p['class']);
    // Private, or closed to everybody.
    if (feature.type !== LINE || !KINDS.has(kind) || p['access'] === 'no') continue;
    const layerNumber = Math.max(-15, Math.min(15, Math.round(Number(p['layer'] ?? 0)) || 0));
    const structure = p['brunnel'] === 'bridge' ? 1 : p['brunnel'] === 'tunnel' ? -1 : 0;
    const oneway = Number(p['oneway'] ?? 0);
    for (const points of feature.loadGeometry()) {
      result.push({
        kind,
        ramp: p['ramp'] === 1,
        oneway: oneway > 0 ? 1 : oneway < 0 ? -1 : 0,
        tunnel: structure < 0,
        level: layerNumber * 3 + structure,
        points,
      });
    }
  }
  return result;
}

function readNames(layer: VectorTileLayer): NameLine[] {
  const result: NameLine[] = [];
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    const p = feature.properties;
    const kind = String(p['class']);
    const name = String(p['name'] || p['ref'] || '').replaceAll(';', ' / ');
    if (feature.type !== LINE || !name || !KINDS.has(kind)) continue;
    for (const points of feature.loadGeometry()) result.push({ name, kind, points });
  }
  return result;
}
