export type CameraMode = 'auto' | 'chase' | 'side' | 'orbit';

export const CAMERA_MODES: readonly CameraMode[] = ['auto', 'chase', 'side', 'orbit'];

export function nextCameraMode(mode: CameraMode): CameraMode {
  return CAMERA_MODES[(CAMERA_MODES.indexOf(mode) + 1) % CAMERA_MODES.length];
}

export type Vec3 = readonly [x: number, y: number, z: number];

export interface CameraView {
  readonly position: Vec3;
  readonly target: Vec3;
}

/** After standing this long, 'auto' turns around the car. */
const SHOWROOM_AFTER_S = 6;

/** The view 'auto' currently stands for. */
export function activeMode(
  mode: CameraMode,
  stoppedS: number,
  calm: boolean,
): Exclude<CameraMode, 'auto'> {
  if (mode !== 'auto') return mode;
  return stoppedS > SHOWROOM_AFTER_S && !calm ? 'orbit' : 'chase';
}

/** Where the camera wants to be. The car stands at the origin and faces -z. */
export function cameraView(
  mode: Exclude<CameraMode, 'auto'>,
  speedMs: number,
  inWorld: boolean,
  orbitAngle: number,
): CameraView {
  if (mode === 'orbit') {
    return {
      position: [Math.sin(orbitAngle) * 8.2, 2.4, Math.cos(orbitAngle) * 8.2],
      target: [0, 0.75, 0],
    };
  }
  if (mode === 'side') return { position: [-6.8, 1.7, -0.4], target: [0, 0.8, -0.4] };
  if (inWorld) {
    const f = Math.min(1, speedMs / 50);
    // Low enough to see houses and trees, not just the ground.
    return { position: [0, 4.4 + f * 1.6, 12 + f * 2.5], target: [0, 0.4, -14] };
  }
  const f = Math.min(1, speedMs / 30);
  return { position: [0, 2.7 + f * 0.4, 8.8 + f * 0.8], target: [0, 0.8, -3] };
}

/** Moves an angle towards another one the short way round. */
export function turnTowards(from: number, to: number, share: number): number {
  return (from + (((((to - from) % 360) + 540) % 360) - 180) * share + 360) % 360;
}
