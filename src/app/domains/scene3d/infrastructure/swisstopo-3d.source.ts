import { Injectable, inject } from '@angular/core';
import { HttpPort } from '@core/http';
import { CacheStore } from '@core/storage';
import { LonLat, METRES_PER_DEGREE_LAT, metresPerDegreeLon } from '../domain/environment';
import { TerrainSource, TilesetSource } from '../domain/ports';
import { TERRAIN_ZOOM } from '../domain/terrain';

const BASE = 'https://3d.geo.admin.ch/';
export const SWISS_BUILDINGS = BASE + 'ch.swisstopo.swissbuildings3d.3d/v1/tileset.json';
export const SWISS_TREES = BASE + 'ch.swisstopo.vegetation.3d/v1/tileset.json';
const TERRAIN = BASE + 'ch.swisstopo.terrain.3d/v1/';

const BUCKET = 'swiss3d';
const MAX_FILES = 3000;
/** The index files change with every release of the data. */
const INDEX_FRESH_MS = 14 * 86_400_000;
const KEEP_RADIUS_M = 350;

interface CachedFile {
  readonly fetchedAt: number;
  readonly bytes: ArrayBuffer;
}

/** swisstopo's public 3D data; free to use and to keep. */
@Injectable()
export class SwissFiles {
  private readonly http = inject(HttpPort);
  private readonly cache = inject(CacheStore);
  private readonly loading = new Map<string, Promise<ArrayBuffer | null>>();

  get(url: string): Promise<ArrayBuffer | null> {
    const running = this.loading.get(url);
    if (running) return running;
    const load = this.load(url).finally(() => this.loading.delete(url));
    this.loading.set(url, load);
    return load;
  }

  private async load(url: string): Promise<ArrayBuffer | null> {
    const cached = await this.cache.get<CachedFile>(BUCKET, url).catch(() => undefined);
    // Data files carry their release in the path and never change.
    const isIndex = /\/v1\/(tileset|layer)\.json$/.test(url);
    if (cached && (!isIndex || Date.now() - cached.fetchedAt < INDEX_FRESH_MS)) return cached.bytes;
    try {
      if (globalThis.navigator?.onLine === false) throw new Error('offline');
      const bytes = await (await this.http.getBlob(url))?.arrayBuffer();
      if (!bytes) throw new Error('not found');
      const entry: CachedFile = { fetchedAt: Date.now(), bytes };
      await this.cache.put(BUCKET, url, entry).catch(() => undefined);
      if (Math.random() < 0.01) void this.cache.prune(BUCKET, MAX_FILES).catch(() => 0);
      return bytes;
    } catch {
      return cached?.bytes ?? null;
    }
  }
}

@Injectable()
export class SwissTerrainSource extends TerrainSource {
  private readonly files = inject(SwissFiles);
  private template?: Promise<string | null>;

  async tile(x: number, y: number): Promise<ArrayBuffer | null> {
    this.template ??= this.readTemplate();
    const template = await this.template;
    if (!template) {
      this.template = undefined;
      return null;
    }
    return this.files.get(
      template
        .replace('{z}', String(TERRAIN_ZOOM))
        .replace('{x}', String(x))
        .replace('{y}', String(y)),
    );
  }

  private async readTemplate(): Promise<string | null> {
    const bytes = await this.files.get(TERRAIN + 'layer.json');
    if (!bytes) return null;
    const layer = JSON.parse(new TextDecoder().decode(bytes)) as {
      tiles: string[];
      version: string;
    };
    return TERRAIN + layer.tiles[0].replace('{version}', layer.version);
  }
}

interface TileNode {
  boundingVolume?: { region?: number[] };
  content?: { uri?: string; url?: string };
  children?: TileNode[];
}

@Injectable()
export class SwissTilesetSource extends TilesetSource {
  private readonly files = inject(SwissFiles);

  async file(url: string): Promise<ArrayBuffer | null> {
    const file = await this.files.get(url);
    const [modelUrl] = file ? referencedModels(file, url) : [];
    if (!file || !modelUrl) return file;
    const model = await this.files.get(modelUrl);
    return model && withModel(file, model);
  }

  async keep(
    points: readonly LonLat[],
    sets: { buildings: boolean; trees: boolean },
    cancelled: () => boolean,
  ): Promise<boolean> {
    const boxes = points.map(boxAround);
    let complete = true;
    if (sets.buildings) complete = (await this.walk(SWISS_BUILDINGS, boxes, cancelled)) && complete;
    if (sets.trees) complete = (await this.walk(SWISS_TREES, boxes, cancelled)) && complete;
    return complete;
  }

  private async walk(
    url: string,
    boxes: readonly Box[],
    cancelled: () => boolean,
  ): Promise<boolean> {
    const bytes = await this.files.get(url);
    if (!bytes) return false;
    const root = (JSON.parse(new TextDecoder().decode(bytes)) as { root: TileNode }).root;
    const contents: string[] = [];
    const collect = (node: TileNode) => {
      const region = node.boundingVolume?.region;
      if (region && !boxes.some((box) => intersects(box, region))) return;
      const content = node.content?.uri ?? node.content?.url;
      if (content) contents.push(new URL(content, url).href);
      node.children?.forEach(collect);
    };
    collect(root);
    let complete = true;
    for (const content of contents) {
      if (cancelled()) return false;
      if (/\.json(\?|$)/.test(content)) {
        complete = (await this.walk(content, boxes, cancelled)) && complete;
        continue;
      }
      const file = await this.files.get(content);
      if (!file) complete = false;
      for (const url of file ? referencedModels(file, content) : []) await this.files.get(url);
    }
    return complete;
  }
}

type Box = readonly [west: number, south: number, east: number, north: number];
const RAD = Math.PI / 180;

function boxAround([lon, lat]: LonLat): Box {
  const dx = KEEP_RADIUS_M / metresPerDegreeLon(lat);
  const dy = KEEP_RADIUS_M / METRES_PER_DEGREE_LAT;
  return [(lon - dx) * RAD, (lat - dy) * RAD, (lon + dx) * RAD, (lat + dy) * RAD];
}

function intersects([west, south, east, north]: Box, region: readonly number[]): boolean {
  return region[0] < east && region[2] > west && region[1] < north && region[3] > south;
}

/** An i3dm may name the model it places (trees) instead of containing it. */
function referencedModels(file: ArrayBuffer, url: string): string[] {
  const start = modelStart(file);
  if (start === null || new DataView(file).getUint32(28, true) !== 0) return [];
  const name = new TextDecoder().decode(new Uint8Array(file, start)).replace(/[\0\s]+$/, '');
  return name ? [new URL(name, url).href] : [];
}

/** Where the model or its name starts in an i3dm, null for other files. */
function modelStart(file: ArrayBuffer): number | null {
  const view = new DataView(file);
  if (file.byteLength < 32 || view.getUint32(0, true) !== 0x6d643369) return null;
  return [12, 16, 20, 24].reduce((sum, at) => sum + view.getUint32(at, true), 32);
}

/** The same file with the named model inside, so that it needs no second request. */
function withModel(file: ArrayBuffer, model: ArrayBuffer): ArrayBuffer {
  const start = modelStart(file) ?? file.byteLength;
  const result = new Uint8Array(start + model.byteLength);
  result.set(new Uint8Array(file, 0, start));
  result.set(new Uint8Array(model), start);
  const view = new DataView(result.buffer);
  view.setUint32(8, result.byteLength, true);
  view.setUint32(28, 1, true);
  return result.buffer;
}
