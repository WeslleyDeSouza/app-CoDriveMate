import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { EnvironmentData, LonLat } from '../domain/environment';
import { MeshData, WorldGeometry, buildWorld } from '../domain/world-geometry';
import { environmentFromTiles } from './vector-tiles';

export interface RawTile {
  readonly x: number;
  readonly y: number;
  readonly bytes: ArrayBuffer;
}

export type WorldRequest =
  | { readonly type: 'decode'; readonly tiles: readonly RawTile[]; readonly center: LonLat }
  | { readonly type: 'build'; readonly data: EnvironmentData };

export type WorldResult = EnvironmentData | WorldGeometry;

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<{ id: number; request: WorldRequest }>) => void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const buffers = (mesh: MeshData): Transferable[] =>
  [mesh.position, mesh.normal, mesh.index, mesh.color].flatMap((array) =>
    array ? [array.buffer as ArrayBuffer] : [],
  );

scope.onmessage = ({ data: { id, request } }) => {
  try {
    if (request.type === 'decode') {
      const tiles = request.tiles.map(({ x, y, bytes }) => ({
        x,
        y,
        layers: new VectorTile(new PbfReader(new Uint8Array(bytes))).layers,
      }));
      scope.postMessage({ id, result: environmentFromTiles(tiles, request.center) });
      return;
    }
    const result = buildWorld(request.data);
    const { sidewalks, roads, lines, markings, buildings, trees } = result;
    scope.postMessage({ id, result }, [
      ...[sidewalks, roads, lines, markings, buildings].flatMap(buffers),
      trees.buffer as ArrayBuffer,
    ]);
  } catch (error) {
    scope.postMessage({ id, error: String(error) });
  }
};
