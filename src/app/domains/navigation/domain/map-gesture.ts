/** How far a finger moved since both were on the map, in pixels. */
export interface FingerMove {
  readonly x: number;
  readonly y: number;
}

export type TwoFingerGesture = 'pitch' | 'zoom';

/** Below this both fingers may still go anywhere. */
const DECIDE_PX = 12;
const MOVED_PX = 6;
/** Up or down counts if it is this much more than sideways. */
const STEEP = 1.5;

export const MIN_TILT = 20;
export const MAX_PITCH = 70;
export const DEFAULT_TILT = 55;
/** Degrees per pixel both fingers move up. */
export const PITCH_PER_PX = 0.3;

/**
 * What two fingers on the map mean: both moving up or down together tilt it,
 * anything else zooms and turns it. Null while they have hardly moved.
 */
export function twoFingerGesture(a: FingerMove, b: FingerMove): TwoFingerGesture | null {
  const far = Math.max(Math.hypot(a.x, a.y), Math.hypot(b.x, b.y));
  if (far < DECIDE_PX) return null;
  const steep = (m: FingerMove) =>
    Math.abs(m.y) >= MOVED_PX && Math.abs(m.y) > Math.abs(m.x) * STEEP;
  return steep(a) && steep(b) && a.y * b.y > 0 ? 'pitch' : 'zoom';
}

/** The tilt to remember from what the user set by hand; nearly flat is flat. */
export function tiltOf(pitch: number): { tilted: boolean; pitch?: number } {
  if (pitch < MIN_TILT / 2) return { tilted: false };
  return { tilted: true, pitch: Math.round(Math.max(MIN_TILT, Math.min(MAX_PITCH, pitch))) };
}
