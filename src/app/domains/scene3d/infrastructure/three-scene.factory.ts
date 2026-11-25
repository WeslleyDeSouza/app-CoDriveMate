import { Injectable, inject } from '@angular/core';
import { MapSurfaceFactory } from '@domains/navigation';
import {
  AerialSource,
  SceneEvents,
  SceneRenderer,
  SceneRendererFactory,
  TerrainSource,
  TilesetSource,
} from '../domain/ports';

/** Loads three.js only when the 3D view is really shown. */
@Injectable()
export class ThreeSceneFactory extends SceneRendererFactory {
  private readonly sources = {
    aerial: inject(AerialSource),
    terrain: inject(TerrainSource),
    tilesets: inject(TilesetSource),
    maps: inject(MapSurfaceFactory),
  };

  async create(container: HTMLElement, events: SceneEvents): Promise<SceneRenderer> {
    const { ThreeScene } = await import('./three-scene');
    return ThreeScene.create(container, this.sources, events);
  }
}
