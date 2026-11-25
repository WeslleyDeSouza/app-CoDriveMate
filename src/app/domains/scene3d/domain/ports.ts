import { CameraMode } from './camera';
import { EnvironmentData, EnvironmentDetails, LonLat } from './environment';
import { WorldGeometry } from './world-geometry';

/** Port: surroundings of a grid cell. Null where neither network nor cache has them. */
export abstract class EnvironmentSource {
  /** Roads, buildings and forests. */
  abstract load(cell: LonLat): Promise<EnvironmentData | null>;
  /** Single trees and crossings, from a slower service. */
  abstract details(cell: LonLat): Promise<EnvironmentDetails | null>;
  /** Stores a cell for offline use. */
  abstract keep(cell: LonLat): Promise<boolean>;
}

/** Port: aerial image tiles. */
export abstract class AerialSource {
  abstract tile(zoom: number, x: number, y: number): Promise<Blob | null>;
}

/** Port: terrain tiles (quantized-mesh). */
export abstract class TerrainSource {
  abstract tile(x: number, y: number): Promise<ArrayBuffer | null>;
}

/** Port: files of 3D tilesets, kept on the device. */
export abstract class TilesetSource {
  abstract file(url: string): Promise<ArrayBuffer | null>;
  /** Stores buildings and trees near the points. False if something is missing. */
  abstract keep(
    points: readonly LonLat[],
    sets: { buildings: boolean; trees: boolean },
    cancelled: () => boolean,
  ): Promise<boolean>;
}

/** Port: turns surroundings into triangles, off the main thread. */
export abstract class GeometryBuilder {
  abstract build(data: EnvironmentData): Promise<WorldGeometry>;
}

export interface SceneEnvironment {
  readonly data: EnvironmentData;
  readonly geometry: WorldGeometry;
}

export interface ScenePose {
  readonly at: LonLat | null;
  readonly heading: number;
  readonly speedKmh: number;
  /** position updates are rare enough (GPS) to be continued in between */
  readonly extrapolate: boolean;
}

export type SceneWorld = 'real' | 'plain' | 'mapbox' | 'google';
export type SceneQuality = 'low' | 'normal' | 'high';

/** What the user switched on. */
export interface SceneOptions {
  readonly quality: SceneQuality;
  readonly sharpAerial: boolean;
  readonly sky: boolean;
  readonly shadows: boolean;
  readonly terrain: boolean;
  readonly swissBuildings: boolean;
  readonly swissTrees: boolean;
  readonly facades: boolean;
  readonly roadDetails: boolean;
}

export interface SceneAppearance {
  readonly dark: boolean;
  readonly world: SceneWorld;
  readonly carColor: string;
  readonly options: SceneOptions;
  readonly googleKey: string;
  readonly mapboxToken: string;
}

export interface SceneEvents {
  /** The graphics device was lost. */
  onLost(): void;
  /** A world cannot be shown (key refused, no connection). */
  onWorldFailed(world: SceneWorld, keyRejected: boolean): void;
  /** Credits that must be shown for what is on screen. */
  onAttribution(text: string): void;
}

/** Port: the drawn scene. */
export interface SceneRenderer {
  setPose(pose: ScenePose): void;
  setEnvironment(environment: SceneEnvironment | null): void;
  setRoute(points: readonly LonLat[] | null): void;
  setAppearance(appearance: SceneAppearance): void;
  setCamera(mode: CameraMode): void;
  /** Drawing stops completely while false. */
  setRunning(running: boolean): void;
  destroy(): void;
}

export abstract class SceneRendererFactory {
  /** Rejects if the device cannot draw 3D. */
  abstract create(container: HTMLElement, events: SceneEvents): Promise<SceneRenderer>;
}
