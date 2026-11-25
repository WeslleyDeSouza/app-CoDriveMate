/**
 * Camera over a Mapbox map and the same camera in three.js, so that the car can
 * be drawn on top with matching perspective.
 */
import { CameraMode } from './camera';
import { LonLat, ahead } from './environment';

/** Vertical field of view of Mapbox maps. */
export const MAPBOX_FOV = 36.87;
const RAD = Math.PI / 180;
const EARTH_M = 40075016.686;
const MAX_ZOOM = 22;

export interface BackdropView {
  /** point of the ground the camera looks at, metres in front of the car */
  readonly lookAheadM: number;
  readonly distanceM: number;
  readonly pitch: number;
  /** turn against the direction of travel */
  readonly turn: number;
}

export function backdropView(
  mode: Exclude<CameraMode, 'auto'>,
  speedMs: number,
  orbitDegrees: number,
): BackdropView {
  const f = Math.min(1, speedMs / 30);
  if (mode === 'orbit') return { lookAheadM: 0, distanceM: 18, pitch: 70, turn: orbitDegrees };
  if (mode === 'side') return { lookAheadM: 0, distanceM: 16, pitch: 74, turn: 90 };
  return { lookAheadM: 6 + f * 4, distanceM: 20 + f * 6, pitch: 77, turn: 0 };
}

/** Zoom at which the camera of a map is `distanceM` away from its centre. */
export function zoomForDistance(distanceM: number, lat: number, heightPx: number): number {
  const distancePx = (0.5 * heightPx) / Math.tan((MAPBOX_FOV * RAD) / 2);
  const metresPerPixel = distanceM / distancePx;
  return Math.min(MAX_ZOOM, Math.log2((EARTH_M * Math.cos(lat * RAD)) / (512 * metresPerPixel)));
}

export function backdropCamera(
  view: BackdropView,
  car: LonLat,
  heading: number,
  heightPx: number,
): { center: LonLat; zoom: number; bearing: number; pitch: number } {
  return {
    center: ahead(car, heading, view.lookAheadM),
    zoom: zoomForDistance(view.distanceM, car[1], heightPx),
    bearing: (heading + view.turn + 360) % 360,
    pitch: view.pitch,
  };
}

/** The same camera in the scene, where the car is at the origin and faces -z. */
export function backdropPosition(view: BackdropView): {
  position: [number, number, number];
  target: [number, number, number];
} {
  const back = view.distanceM * Math.sin(view.pitch * RAD);
  const up = view.distanceM * Math.cos(view.pitch * RAD);
  const turn = view.turn * RAD;
  const target: [number, number, number] = [0, 0, -view.lookAheadM];
  return {
    position: [-Math.sin(turn) * back, up, target[2] + Math.cos(turn) * back],
    target,
  };
}
