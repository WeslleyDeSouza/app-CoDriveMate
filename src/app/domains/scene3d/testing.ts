import { Provider } from '@angular/core';
import { CameraMode } from './domain/camera';
import { EnvironmentData, EnvironmentDetails, LonLat } from './domain/environment';
import {
  AerialSource,
  EnvironmentSource,
  GeometryBuilder,
  SceneAppearance,
  SceneEnvironment,
  SceneEvents,
  ScenePose,
  SceneRenderer,
  SceneRendererFactory,
  TerrainSource,
  TilesetSource,
} from './domain/ports';
import { buildWorld } from './domain/world-geometry';

export class FakeSceneRenderer implements SceneRenderer {
  pose?: ScenePose;
  environment: SceneEnvironment | null = null;
  route: readonly LonLat[] | null = null;
  appearance?: SceneAppearance;
  camera?: CameraMode;
  running = false;
  destroyed = false;

  setPose(pose: ScenePose): void {
    this.pose = pose;
  }
  setEnvironment(environment: SceneEnvironment | null): void {
    this.environment = environment;
  }
  setRoute(points: readonly LonLat[] | null): void {
    this.route = points;
  }
  setAppearance(appearance: SceneAppearance): void {
    this.appearance = appearance;
  }
  setCamera(mode: CameraMode): void {
    this.camera = mode;
  }
  setRunning(running: boolean): void {
    this.running = running;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

export class FakeSceneRendererFactory extends SceneRendererFactory {
  renderer = new FakeSceneRenderer();
  created = 0;
  failure?: Error;
  events?: SceneEvents;

  async create(_container: HTMLElement, events: SceneEvents): Promise<SceneRenderer> {
    if (this.failure) throw this.failure;
    this.created++;
    this.events = events;
    return (this.renderer = new FakeSceneRenderer());
  }
}

export class FakeEnvironmentSource extends EnvironmentSource {
  readonly asked: LonLat[] = [];
  answer: (cell: LonLat) => EnvironmentData | null = () => null;

  extra: EnvironmentDetails | null = null;
  kept = 0;

  async details(): Promise<EnvironmentDetails | null> {
    return this.extra;
  }
  async keep(): Promise<boolean> {
    this.kept++;
    return true;
  }
  async load(cell: LonLat): Promise<EnvironmentData | null> {
    this.asked.push(cell);
    return this.answer(cell);
  }
}

/** Counts what is asked for; every file exists. */
export class FakeSwissData extends TilesetSource {
  readonly aerial: string[] = [];
  readonly terrain: string[] = [];
  readonly kept: { buildings: boolean; trees: boolean }[] = [];

  async file(): Promise<ArrayBuffer | null> {
    return null;
  }
  async keep(
    _points: readonly LonLat[],
    sets: { buildings: boolean; trees: boolean },
  ): Promise<boolean> {
    this.kept.push(sets);
    return true;
  }
}

/** The real scene store on top of controllable surroundings and a fake renderer. */
export function scene3dTesting() {
  const fakes = {
    scenes: new FakeSceneRendererFactory(),
    osm: new FakeEnvironmentSource(),
    swiss: new FakeSwissData(),
  };
  const providers: Provider[] = [
    { provide: SceneRendererFactory, useValue: fakes.scenes },
    { provide: EnvironmentSource, useValue: fakes.osm },
    { provide: TilesetSource, useValue: fakes.swiss },
    {
      provide: AerialSource,
      useValue: {
        tile: async (zoom: number, x: number, y: number) => {
          fakes.swiss.aerial.push(`${zoom}/${x}/${y}`);
          return new Blob();
        },
      },
    },
    {
      provide: TerrainSource,
      useValue: {
        tile: async (x: number, y: number) => {
          fakes.swiss.terrain.push(`${x}/${y}`);
          return new ArrayBuffer(0);
        },
      },
    },
    {
      provide: GeometryBuilder,
      useValue: { build: async (data: EnvironmentData) => buildWorld(data) },
    },
  ];
  return { ...fakes, providers };
}
