import { TilesRenderer } from '3d-tiles-renderer';
import { GLTFExtensionsPlugin, GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins';
import {
  Camera,
  Group,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Raycaster,
  Vector3,
  WebGLRenderer,
} from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { LonLat } from '../domain/environment';
import { TilesetSource } from '../domain/ports';

const RAD = Math.PI / 180;
const A = 6378137;
const E2 = 0.00669437999014;

/** Earth-fixed coordinates -> x east, y up, z south around a point. */
export function localFrame([lon, lat]: LonLat, height: number): Matrix4 {
  const [sinLon, cosLon] = [Math.sin(lon * RAD), Math.cos(lon * RAD)];
  const [sinLat, cosLat] = [Math.sin(lat * RAD), Math.cos(lat * RAD)];
  const n = A / Math.sqrt(1 - E2 * sinLat * sinLat);
  const x = (n + height) * cosLat * cosLon;
  const y = (n + height) * cosLat * sinLon;
  const z = (n * (1 - E2) + height) * sinLat;
  const east = [-sinLon, cosLon, 0];
  const up = [cosLat * cosLon, cosLat * sinLon, sinLat];
  const south = [sinLat * cosLon, sinLat * sinLon, -cosLat];
  const shift = (v: number[]) => -(v[0] * x + v[1] * y + v[2] * z);
  // prettier-ignore
  return new Matrix4().set(
    east[0], east[1], east[2], shift(east),
    up[0], up[1], up[2], shift(up),
    south[0], south[1], south[2], shift(south),
    0, 0, 0, 1,
  );
}

let draco: DRACOLoader | undefined;
function dracoLoader(): DRACOLoader {
  draco ??= new DRACOLoader().setDecoderPath(new URL('assets/draco/', document.baseURI).href);
  return draco;
}

/** One 3D tileset placed in the scene. */
export class SceneTileset {
  readonly group = new Group();
  private readonly tiles: TilesRenderer;
  private resolution = '';

  constructor(
    url: string | undefined,
    plugins: readonly object[],
    private readonly camera: Camera,
    errorTarget: number,
    onModel?: (scene: Object3D) => void,
    onError?: (message: string) => void,
  ) {
    this.tiles = new TilesRenderer(url);
    this.tiles.registerPlugin(
      new GLTFExtensionsPlugin({ dracoLoader: dracoLoader(), autoDispose: false }),
    );
    plugins.forEach((plugin) => this.tiles.registerPlugin(plugin));
    this.tiles.errorTarget = errorTarget;
    this.tiles.setCamera(camera);
    if (onModel) this.tiles.addEventListener('load-model', ({ scene }) => onModel(scene));
    if (onError) this.tiles.addEventListener('load-error', ({ error }) => onError(String(error)));
    this.group.add(this.tiles.group);
  }

  set quality(errorTarget: number) {
    this.tiles.errorTarget = errorTarget;
  }

  place(origin: LonLat, height: number): void {
    localFrame(origin, height).decompose(
      this.tiles.group.position,
      this.tiles.group.quaternion,
      this.tiles.group.scale,
    );
  }

  update(renderer: WebGLRenderer): void {
    const size = `${renderer.domElement.width}x${renderer.domElement.height}`;
    if (size !== this.resolution) {
      this.resolution = size;
      this.tiles.setResolutionFromRenderer(this.camera, renderer);
    }
    this.group.updateWorldMatrix(true, true);
    this.camera.updateMatrixWorld();
    this.tiles.update();
  }

  /** Whether anything is on screen. */
  get visible(): boolean {
    return this.tiles.group.children.length > 0;
  }

  /** Files that were not available are asked for again. */
  retry(): void {
    this.tiles.resetFailedTiles();
  }

  /** Height of the surface at the car, null if none is loaded. */
  surface(): number | null {
    const ray = new Raycaster(new Vector3(0, 3000, 0), new Vector3(0, -1, 0), 0, 8000);
    const heights = ray.intersectObject(this.tiles.group, true).map(({ point }) => point.y);
    if (!heights.length) return null;
    // Of road, bridge and tree tops, the one the car was on.
    return heights.reduce((best, y) => (Math.abs(y) < Math.abs(best) ? y : best));
  }

  attribution(): string {
    return this.tiles
      .getAttributions()
      .filter(({ type }) => type === 'string')
      .map(({ value }) => String(value))
      .join(' · ');
  }

  dispose(): void {
    this.group.removeFromParent();
    this.tiles.dispose();
  }
}

/** Serves swisstopo files from the device cache. */
function cachePlugin(source: TilesetSource): object {
  return {
    name: 'CDM_CACHE',
    fetchData: async (url: string | URL) => {
      const bytes = await source.file(String(url));
      if (!bytes) throw new Error('Not available: ' + url);
      return new Response(bytes);
    },
  };
}

export function swissTileset(
  url: string,
  source: TilesetSource,
  camera: Camera,
  errorTarget: number,
  onModel: (scene: Object3D) => void,
): SceneTileset {
  return new SceneTileset(url, [cachePlugin(source)], camera, errorTarget, onModel);
}

/** Google's photographed surroundings. Never cached: Google does not allow it. */
export function googleTileset(
  key: string,
  camera: Camera,
  errorTarget: number,
  onError: (message: string) => void,
): SceneTileset {
  const auth = new GoogleCloudAuthPlugin({ apiToken: key, autoRefreshToken: true });
  return new SceneTileset(undefined, [auth], camera, errorTarget, undefined, onError);
}

/** Gives all buildings of a tile one shared material. */
export function useMaterial(scene: Object3D, material: MeshStandardMaterial): void {
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    for (const old of [object.material].flat() as Material[]) if (old !== material) old.dispose();
    object.material = material;
    object.castShadow = true; // received ones flicker on walls the sun grazes
  });
}

export function castShadows(scene: Object3D): void {
  scene.traverse((object) => {
    if (object instanceof Mesh) object.castShadow = true;
  });
}
