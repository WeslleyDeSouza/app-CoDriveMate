import { LonLat } from './environment';

export const TERRAIN_ZOOM = 15;
const GRID = 65;

/** Tile of the geographic (EPSG:4326, TMS) grid a point lies in. */
export function terrainTileOf([lon, lat]: LonLat): { x: number; y: number } {
  return {
    x: Math.floor(((lon + 180) / 360) * 2 ** (TERRAIN_ZOOM + 1)),
    y: Math.floor(((lat + 90) / 180) * 2 ** TERRAIN_ZOOM),
  };
}

/** Heights of one tile on a regular grid, from a quantized-mesh tile. */
export function decodeHeights(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  const min = view.getFloat32(24, true);
  const max = view.getFloat32(28, true);
  const count = view.getUint32(88, true);
  let offset = 92;
  const read = (): Float32Array => {
    const values = new Float32Array(count);
    let value = 0;
    for (let i = 0; i < count; i++, offset += 2) {
      const coded = view.getUint16(offset, true);
      value += (coded >> 1) ^ -(coded & 1); // zig-zag coded differences
      values[i] = value / 32767;
    }
    return values;
  };
  const u = read();
  const v = read();
  const h = read();
  const wide = count > 65536;
  if (wide && offset % 4) offset += 2;
  const triangles = view.getUint32(offset, true);
  offset += 4;
  let highest = 0;
  const index = (): number => {
    const code = wide ? view.getUint32(offset, true) : view.getUint16(offset, true);
    offset += wide ? 4 : 2;
    const result = highest - code; // high water mark coded
    if (code === 0) highest++;
    return result;
  };

  const heights = new Float32Array(GRID * GRID).fill(NaN);
  const n = GRID - 1;
  for (let t = 0; t < triangles; t++) {
    const [a, b, c] = [index(), index(), index()];
    const [ax, ay, bx, by, cx, cy] = [u[a] * n, v[a] * n, u[b] * n, v[b] * n, u[c] * n, v[c] * n];
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-9) continue;
    const x1 = Math.min(n, Math.floor(Math.max(ax, bx, cx) + 1e-6));
    const y1 = Math.min(n, Math.floor(Math.max(ay, by, cy) + 1e-6));
    for (let y = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 1e-6)); y <= y1; y++) {
      for (let x = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 1e-6)); x <= x1; x++) {
        const wb = ((x - ax) * (cy - ay) - (cx - ax) * (y - ay)) / area;
        const wc = ((bx - ax) * (y - ay) - (x - ax) * (by - ay)) / area;
        const wa = 1 - wb - wc;
        if (wa < -1e-4 || wb < -1e-4 || wc < -1e-4) continue;
        heights[y * GRID + x] = min + (max - min) * (wa * h[a] + wb * h[b] + wc * h[c]);
      }
    }
  }
  // Rounding may leave a point out: take its neighbour.
  for (let i = 0; i < heights.length; i++) {
    if (Number.isNaN(heights[i])) heights[i] = i > 0 ? heights[i - 1] : min;
  }
  return heights;
}

/** Heights above sea level from the tiles loaded so far. */
export class HeightField {
  private readonly tiles = new Map<string, Float32Array>();

  has(x: number, y: number): boolean {
    return this.tiles.has(`${x}/${y}`);
  }

  set(x: number, y: number, heights: Float32Array): void {
    this.tiles.set(`${x}/${y}`, heights);
  }

  /** Drops tiles far away from a point. */
  prune(around: { x: number; y: number }, distance: number): void {
    for (const key of [...this.tiles.keys()]) {
      const [x, y] = key.split('/').map(Number);
      if (Math.abs(x - around.x) > distance || Math.abs(y - around.y) > distance) {
        this.tiles.delete(key);
      }
    }
  }

  /** Metres above sea level, null where nothing is loaded. */
  heightAt(lon: number, lat: number): number | null {
    const fx = ((lon + 180) / 360) * 2 ** (TERRAIN_ZOOM + 1);
    const fy = ((lat + 90) / 180) * 2 ** TERRAIN_ZOOM;
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    const heights = this.tiles.get(`${x}/${y}`);
    if (!heights) return null;
    const gx = (fx - x) * (GRID - 1);
    const gy = (fy - y) * (GRID - 1);
    const ix = Math.min(GRID - 2, Math.floor(gx));
    const iy = Math.min(GRID - 2, Math.floor(gy));
    const [tx, ty] = [gx - ix, gy - iy];
    const at = (dx: number, dy: number) => heights[(iy + dy) * GRID + ix + dx];
    return (
      at(0, 0) * (1 - tx) * (1 - ty) +
      at(1, 0) * tx * (1 - ty) +
      at(0, 1) * (1 - tx) * ty +
      at(1, 1) * tx * ty
    );
  }
}
