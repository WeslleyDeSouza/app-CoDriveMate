import {
  BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Texture,
} from 'three';
import { LonLat, hasAerialImages, tileCorner, tileOf } from '../domain/environment';
import { AerialSource, TerrainSource } from '../domain/ports';
import { HeightField, decodeHeights, terrainTileOf } from '../domain/terrain';
import { Flat } from '../domain/world-geometry';

/** Aerial images: zoom, radius in tiles, and how finely a tile follows the terrain. */
const LEVELS = [
  { zoom: 18, radius: 4.5, segments: 24, sharp: false },
  { zoom: 19, radius: 2.3, segments: 12, sharp: true },
  { zoom: 20, radius: 2.3, segments: 8, sharp: true },
];
const MAX_LOADS = 6;
const GROUND_M = 2000;
const GROUND_STEPS = 160;
const GROUND_SNAP_M = GROUND_M / GROUND_STEPS;

export interface GroundFrame {
  origin: LonLat;
  local(point: LonLat): Flat;
  lonLat(x: number, z: number): LonLat;
}

/** The ground: terrain heights, aerial images and a base below them. */
export class SceneGround {
  readonly group = new Group();
  /** Height above sea level that is y = 0. */
  base = 0;
  private frame?: GroundFrame;
  private field = new HeightField();
  private terrainOn = false;
  private aerialOn = false;
  private sharp = false;
  private readonly tiles = new Map<string, Mesh | null>();
  private readonly aerialGroup = new Group();
  private loads = 0;
  private lastAt?: LonLat;
  private readonly wantedTerrain = new Set<string>();
  private disposed = false;
  readonly material = new MeshStandardMaterial({ roughness: 1 });
  private readonly ground = new Mesh(
    new PlaneGeometry(GROUND_M, GROUND_M, GROUND_STEPS, GROUND_STEPS).rotateX(-Math.PI / 2),
    this.material,
  );

  constructor(
    private readonly aerial: AerialSource,
    private readonly terrain: TerrainSource,
    private readonly onHeights: () => void,
  ) {
    this.ground.receiveShadow = true;
    this.ground.frustumCulled = false;
    this.group.add(this.ground, this.aerialGroup);
  }

  setFrame(frame: GroundFrame): void {
    this.frame = frame;
    this.base = this.terrainOn ? (this.field.heightAt(...frame.origin) ?? this.base) : 0;
    this.clearAerial();
    this.drapeGround(0, 0);
  }

  setOptions(aerial: boolean, sharp: boolean, terrain: boolean): void {
    if (aerial !== this.aerialOn || sharp !== this.sharp) this.clearAerial();
    this.aerialOn = aerial;
    this.sharp = sharp;
    if (terrain === this.terrainOn) return;
    this.clearAerial(); // flat tiles have too few points
    this.terrainOn = terrain;
    this.field = new HeightField();
    this.wantedTerrain.clear();
    if (!terrain) this.heightsChanged();
  }

  /** y of the ground at a place of the scene. */
  elevation(x: number, z: number): number {
    if (!this.terrainOn || !this.frame) return 0;
    const height = this.field.heightAt(...this.frame.lonLat(x, z));
    return height === null ? 0 : height - this.base;
  }

  /** Lifts a mesh onto the terrain; its own heights stay on top of it. */
  drape(mesh: Mesh, offsetX = 0, offsetZ = 0, scaleX = 1): void {
    const position = mesh.geometry.getAttribute('position') as BufferAttribute;
    const array = position.array as Float32Array;
    mesh.userData['flat'] ??= array.slice();
    const flat = mesh.userData['flat'] as Float32Array;
    const lift = this.terrainOn ? ((mesh.userData['lift'] as number | undefined) ?? 0) : 0;
    for (let i = 0; i < array.length; i += 3) {
      array[i + 1] =
        flat[i + 1] + lift + this.elevation(flat[i] * scaleX + offsetX, flat[i + 2] + offsetZ);
    }
    position.needsUpdate = true;
    if (this.terrainOn) mesh.geometry.computeBoundingSphere();
  }

  /** Called now and then with the place of the car. */
  update(at: LonLat, x: number, z: number): void {
    this.loadTerrain(at);
    this.updateAerial(at);
    if (Math.hypot(x - this.ground.position.x, z - this.ground.position.z) > 120) {
      this.drapeGround(x, z);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clearAerial();
    this.ground.geometry.dispose();
    this.material.dispose();
  }

  private drapeGround(x: number, z: number): void {
    const snap = (value: number) => Math.round(value / GROUND_SNAP_M) * GROUND_SNAP_M;
    this.ground.position.set(snap(x), 0, snap(z));
    this.drape(this.ground, this.ground.position.x, this.ground.position.z);
    // Below the images and roads, and clearly so on slopes.
    this.ground.position.y = this.terrainOn ? (this.aerialOn ? -2.5 : -0.4) : -0.03;
    if (this.terrainOn) this.ground.geometry.computeVertexNormals();
  }

  private loadTerrain(at: LonLat): void {
    if (!this.terrainOn || !hasAerialImages(at)) return;
    const center = terrainTileOf(at);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const [x, y] = [center.x + dx, center.y + dy];
        const key = `${x}/${y}`;
        if (this.field.has(x, y) || this.wantedTerrain.has(key)) continue;
        this.wantedTerrain.add(key);
        const field = this.field;
        void this.terrain
          .tile(x, y)
          .then((bytes) => {
            if (!bytes || field !== this.field || this.disposed) return;
            field.set(x, y, decodeHeights(bytes));
            field.prune(center, 4);
            this.heightsChanged();
          })
          .catch(() => undefined)
          .finally(() => {
            // A failed tile may be asked for again later.
            setTimeout(() => this.wantedTerrain.delete(key), 15000);
          });
      }
    }
  }

  private changeTimer?: ReturnType<typeof setTimeout>;
  private heightsChanged(): void {
    // Several tiles arrive together; lift everything once.
    clearTimeout(this.changeTimer);
    this.changeTimer = setTimeout(() => {
      if (this.disposed || !this.frame) return;
      if (this.terrainOn && this.base === 0) {
        this.base = this.field.heightAt(...this.frame.origin) ?? 0;
      }
      if (!this.terrainOn) this.base = 0;
      this.drapeGround(this.ground.position.x, this.ground.position.z);
      for (const mesh of this.tiles.values()) if (mesh) this.drapeTile(mesh);
      this.onHeights();
    }, 120);
  }

  private drapeTile(mesh: Mesh): void {
    this.drape(mesh, mesh.position.x, mesh.position.z);
  }

  private updateAerial(at: LonLat): void {
    if (!this.aerialOn || !this.frame || !hasAerialImages(at)) return;
    this.lastAt = at;
    const keep = new Set<string>();
    const wanted: { key: string; level: number; x: number; y: number; d: number }[] = [];
    LEVELS.forEach(({ zoom, radius, sharp }, level) => {
      if (sharp && !this.sharp) return;
      const center = tileOf(at, zoom);
      const r = Math.ceil(radius);
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const d = Math.hypot(dx, dy);
          if (d > radius) continue;
          const [x, y] = [center.x + dx, center.y + dy];
          const key = `${zoom}/${x}/${y}`;
          keep.add(key);
          if (!this.tiles.has(key)) wanted.push({ key, level, x, y, d: d / 2 ** level });
        }
      }
    });
    for (const key of [...this.tiles.keys()]) if (!keep.has(key)) this.remove(key);
    // From the car outwards, the rough image of a place before the sharp one.
    wanted.sort((a, b) => a.d - b.d || a.level - b.level);
    for (const { key, level, x, y } of wanted) {
      if (this.loads >= MAX_LOADS) break;
      void this.load(key, level, x, y);
    }
  }

  private async load(key: string, level: number, x: number, y: number): Promise<void> {
    const frame = this.frame;
    if (!frame) return;
    const { zoom, segments } = LEVELS[level];
    this.tiles.set(key, null);
    this.loads++;
    try {
      const blob = await this.aerial.tile(zoom, x, y);
      const image = blob && (await createImageBitmap(blob, { imageOrientation: 'flipY' }));
      const stale =
        this.disposed ||
        this.frame !== frame ||
        this.tiles.get(key) !== null ||
        !this.tiles.has(key);
      if (!image || stale) return void image?.close();
      const texture = new Texture(image);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
      texture.addEventListener('dispose', () => image.close());
      const [west, north] = frame.local(tileCorner(x, y, zoom));
      const [east, south] = frame.local(tileCorner(x + 1, y + 1, zoom));
      const steps = this.terrainOn ? segments : 1;
      const mesh = new Mesh(
        new PlaneGeometry(east - west, south - north, steps, steps).rotateX(-Math.PI / 2),
        new MeshLambertMaterial({
          map: texture,
          polygonOffset: true,
          polygonOffsetFactor: -1 - level,
          polygonOffsetUnits: -2 - level * 2,
        }),
      );
      mesh.position.set((west + east) / 2, 0, (north + south) / 2);
      // Coarse tiles must not cut through finer ones or the road on slopes.
      mesh.position.y = this.terrainOn ? -0.34 + level * 0.06 : -0.012 + level * 0.004;
      mesh.renderOrder = level;
      mesh.receiveShadow = true;
      this.drapeTile(mesh);
      this.aerialGroup.add(mesh);
      this.tiles.set(key, mesh);
    } catch {
      // Broken image: leave the ground visible there.
    } finally {
      this.loads--;
      if (!this.disposed && this.frame === frame && this.lastAt) this.updateAerial(this.lastAt);
    }
  }

  private remove(key: string): void {
    const mesh = this.tiles.get(key);
    this.tiles.delete(key);
    if (!mesh) return;
    this.aerialGroup.remove(mesh);
    mesh.geometry.dispose();
    const material = mesh.material as MeshLambertMaterial;
    material.map?.dispose();
    material.dispose();
  }

  private clearAerial(): void {
    for (const key of [...this.tiles.keys()]) this.remove(key);
  }
}
