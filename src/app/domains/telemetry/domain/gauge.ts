/** The dial is open at the bottom: from lower left clockwise to lower right. */
const START_DEG = -135;
const SWEEP_DEG = 270;

export interface GaugeTick {
  readonly deg: number;
  /** null for the small ticks in between */
  readonly label: number | null;
  readonly x: number;
  readonly y: number;
}

/** Angle of a value, 0 = up, clockwise; never beyond the ends of the dial. */
export function gaugeAngle(value: number, max: number): number {
  return START_DEG + (Math.min(max, Math.max(0, value)) / max) * SWEEP_DEG;
}

/** Point on a circle around the middle (0, 0). */
export function gaugePoint(deg: number, radius: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  const round = (value: number) => Math.round(value * 100) / 100 || 0;
  return { x: round(Math.sin(rad) * radius), y: round(-Math.cos(rad) * radius) };
}

/** Ticks of the scale; every second one carries its number. */
export function gaugeTicks(max: number, step: number, labelRadius: number): GaugeTick[] {
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => {
    const deg = gaugeAngle(i * step, max);
    return { deg, label: i % 2 ? null : i * step, ...gaugePoint(deg, labelRadius) };
  });
}

/** SVG path of an arc between two values. */
export function gaugeArc(from: number, to: number, max: number, radius: number): string {
  const [a, b] = [gaugeAngle(from, max), gaugeAngle(to, max)];
  if (b <= a) return '';
  const start = gaugePoint(a, radius);
  const end = gaugePoint(b, radius);
  const large = b - a > 180 ? 1 : 0;
  return `M${start.x} ${start.y}A${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`;
}
