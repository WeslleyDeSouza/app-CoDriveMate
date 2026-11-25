import { Injectable, inject } from '@angular/core';
import { OfflineSaver, OfflineSaveJob } from '@domains/navigation';
import { SettingsStore } from '@domains/settings';
import {
  LonLat,
  cellKey,
  cellOf,
  hasAerialImages,
  pointsAlong,
  tileOf,
} from '../domain/environment';
import { AerialSource, EnvironmentSource, TerrainSource, TilesetSource } from '../domain/ports';
import { terrainTileOf } from '../domain/terrain';

const STEP_M = 250;
const AERIAL_ZOOM = 18;
/** The closest images cover little ground each, so they are sampled more often. */
const SHARP = [
  { zoom: 19, stepM: 60 },
  { zoom: 20, stepM: 30 },
];
/** About 30 MB per zoom; longer routes are saved from their start. */
const MAX_AERIAL_TILES = 2000;
/** Buildings and trees are saved in pieces of the route. */
const PIECE = 8;
const PARALLEL = 4;

/** Saves what the 3D view needs along a route. */
@Injectable()
export class SceneOfflineSaver extends OfflineSaver {
  private readonly environment = inject(EnvironmentSource);
  private readonly aerial = inject(AerialSource);
  private readonly terrain = inject(TerrainSource);
  private readonly tilesets = inject(TilesetSource);
  private readonly settings = inject(SettingsStore).settings;

  async save(points: readonly LonLat[], job: OfflineSaveJob): Promise<boolean> {
    const { scene3d, sceneWorld, scene } = this.settings().map;
    if (!scene3d) return true;
    const along = pointsAlong(points, STEP_M);
    const cells = new Map(along.map((point) => [cellKey(cellOf(point)), cellOf(point)]));
    const tasks: (() => Promise<boolean>)[] = [...cells.values()].map(
      (cell) => () => this.environment.keep(cell),
    );
    if (sceneWorld !== 'plain') {
      const levels = [{ zoom: AERIAL_ZOOM, stepM: STEP_M }, ...(scene.sharpAerial ? SHARP : [])];
      for (const { zoom, stepM } of levels) {
        for (const { x, y } of this.aerialTiles(pointsAlong(points, stepM), zoom)) {
          tasks.push(async () => (await this.aerial.tile(zoom, x, y)) !== null);
        }
      }
    }
    const swiss = along.filter(hasAerialImages);
    if (scene.terrain || scene.swissBuildings || scene.swissTrees) {
      for (const { x, y } of this.terrainTiles(swiss)) {
        tasks.push(async () => (await this.terrain.tile(x, y)) !== null);
      }
    }
    if (scene.swissBuildings || scene.swissTrees) {
      const sets = { buildings: scene.swissBuildings, trees: scene.swissTrees };
      for (let i = 0; i < swiss.length; i += PIECE) {
        const piece = swiss.slice(i, i + PIECE);
        tasks.push(() => this.tilesets.keep(piece, sets, job.cancelled));
      }
    }
    let next = 0;
    let done = 0;
    let complete = true;
    const work = async () => {
      while (next < tasks.length && !job.cancelled()) {
        if (!(await tasks[next++]())) complete = false;
        job.progress(++done / tasks.length);
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, work));
    return complete && !job.cancelled();
  }

  private terrainTiles(along: readonly LonLat[]): { x: number; y: number }[] {
    const tiles = new Map<string, { x: number; y: number }>();
    for (const point of along) {
      const { x, y } = terrainTileOf(point);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          tiles.set(`${x + dx}/${y + dy}`, { x: x + dx, y: y + dy });
        }
      }
    }
    return [...tiles.values()];
  }

  private aerialTiles(along: readonly LonLat[], zoom: number): { x: number; y: number }[] {
    const tiles = new Map<string, { x: number; y: number }>();
    for (const point of along) {
      if (!hasAerialImages(point)) continue;
      const { x, y } = tileOf(point, zoom);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (tiles.size >= MAX_AERIAL_TILES) return [...tiles.values()];
          tiles.set(`${x + dx}/${y + dy}`, { x: x + dx, y: y + dy });
        }
      }
    }
    return [...tiles.values()];
  }
}
