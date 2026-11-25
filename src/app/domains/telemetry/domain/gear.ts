const TOLERANCE = 0.15;

/** Gear from speed and rpm: 0 = neutral or standing, null = between gears. */
export function estimateGear(
  speedKmh: number,
  rpm: number,
  ratios: readonly number[],
): number | null {
  if (speedKmh < 3 || rpm <= 0) return 0;
  const ratio = (speedKmh / rpm) * 1000;
  let best: number | null = null;
  let bestError = TOLERANCE;
  ratios.forEach((value, i) => {
    const error = Math.abs(value - ratio) / value;
    if (error < bestError) {
      bestError = error;
      best = i + 1;
    }
  });
  return best;
}
