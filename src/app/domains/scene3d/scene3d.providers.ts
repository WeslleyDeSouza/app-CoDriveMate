import { Provider } from '@angular/core';
import { OFFLINE_SAVERS } from '@domains/navigation';
import { SceneOfflineSaver } from './application/scene-offline';
import {
  AerialSource,
  EnvironmentSource,
  GeometryBuilder,
  SceneRendererFactory,
  TerrainSource,
  TilesetSource,
} from './domain/ports';
import { OsmEnvironmentSource } from './infrastructure/osm-environment.source';
import {
  SwissFiles,
  SwissTerrainSource,
  SwissTilesetSource,
} from './infrastructure/swisstopo-3d.source';
import { SwisstopoAerialSource } from './infrastructure/swisstopo-aerial.source';
import { ThreeSceneFactory } from './infrastructure/three-scene.factory';
import { WorkerGeometryBuilder, WorldWorker } from './infrastructure/worker-geometry.builder';

export function provideScene3d(): Provider[] {
  return [
    WorldWorker,
    SwissFiles,
    { provide: TerrainSource, useClass: SwissTerrainSource },
    { provide: TilesetSource, useClass: SwissTilesetSource },
    { provide: OFFLINE_SAVERS, useClass: SceneOfflineSaver, multi: true },
    { provide: EnvironmentSource, useClass: OsmEnvironmentSource },
    { provide: AerialSource, useClass: SwisstopoAerialSource },
    { provide: GeometryBuilder, useClass: WorkerGeometryBuilder },
    { provide: SceneRendererFactory, useClass: ThreeSceneFactory },
  ];
}
