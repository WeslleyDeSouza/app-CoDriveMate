export type Speeding = 'warn' | 'crit';

/** Speedometers and limits from the map are not exact. */
const TOLERANCE_KMH = 3;
const CRITICAL_KMH = 10;

/** How much too fast, null if it is fine or the limit is unknown. */
export function speeding(speedKmh: number, limitKmh: number | null): Speeding | null {
  const over = limitKmh === null ? 0 : speedKmh - limitKmh;
  if (over >= CRITICAL_KMH) return 'crit';
  return over > TOLERANCE_KMH ? 'warn' : null;
}
