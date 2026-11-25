import { backdropCamera, backdropPosition, backdropView, zoomForDistance } from './backdrop';
import { LonLat, METRES_PER_DEGREE_LAT } from './environment';
import { daylight, lightPreset, skyColors, sunPosition } from './sun';
import { HeightField, decodeHeights, terrainTileOf } from './terrain';

const ZURICH: LonLat = [8.54, 47.38];

describe('sun', () => {
  it('stands high in the south at noon in summer', () => {
    const { altitude, azimuth } = sunPosition(new Date('2026-06-21T11:27:00Z'), ZURICH);
    expect(altitude).toBeCloseTo(66.1, 0);
    expect(Math.abs(azimuth - 180)).toBeLessThan(3);
  });

  it('rises in the east and is below the horizon at night', () => {
    const morning = sunPosition(new Date('2026-03-20T06:00:00Z'), ZURICH);
    expect(morning.altitude).toBeGreaterThan(-3);
    expect(morning.altitude).toBeLessThan(10);
    expect(Math.abs(morning.azimuth - 90)).toBeLessThan(10);
    expect(sunPosition(new Date('2026-12-21T23:00:00Z'), ZURICH).altitude).toBeLessThan(-50);
  });

  it('chooses light and colours', () => {
    expect(lightPreset({ altitude: 30, azimuth: 180 })).toBe('day');
    expect(lightPreset({ altitude: 2, azimuth: 90 })).toBe('dawn');
    expect(lightPreset({ altitude: 2, azimuth: 270 })).toBe('dusk');
    expect(lightPreset({ altitude: -20, azimuth: 0 })).toBe('night');
    expect(daylight(-10)).toBe(0);
    expect(daylight(40)).toBe(1);
    const blue = [-40, -5, 0, 10, 60].map((altitude) => skyColors(altitude).top[2]);
    expect([...blue].sort((a, b) => a - b)).toEqual(blue);
  });
});

/** Two triangles, rising from west (100 m) to east (200 m). */
function tile(): ArrayBuffer {
  const buffer = new ArrayBuffer(92 + 4 * 6 + 4 + 12);
  const view = new DataView(buffer);
  view.setFloat32(24, 100, true);
  view.setFloat32(28, 200, true);
  view.setUint32(88, 4, true);
  const zigzag = (n: number) => (n << 1) ^ (n >> 31);
  const write = (at: number, values: number[]) =>
    values.reduce((before, value, i) => {
      view.setUint16(at + i * 2, zigzag(value - before) & 0xffff, true);
      return value;
    }, 0);
  const M = 32767;
  write(92, [0, M, 0, M]); // u
  write(100, [0, 0, M, M]); // v
  write(108, [0, M, 0, M]); // height
  view.setUint32(116, 2, true);
  // indices 0 1 2, 1 3 2, coded against the highest so far
  [0, 0, 0, 2, 0, 2].forEach((code, i) => view.setUint16(120 + i * 2, code, true));
  return buffer;
}

describe('terrain', () => {
  it('reads heights and interpolates between them', () => {
    const { x, y } = terrainTileOf(ZURICH);
    const field = new HeightField();
    expect(field.heightAt(...ZURICH)).toBeNull();
    field.set(x, y, decodeHeights(tile()));
    const step = 360 / 2 ** 16;
    const west = x * step - 180;
    const south = y * step - 90;
    expect(field.heightAt(west + step * 0.25, south + step * 0.5)).toBeCloseTo(125, 1);
    expect(field.heightAt(west + step * 0.9, south + step * 0.1)).toBeCloseTo(190, 1);
  });

  it('drops tiles far away', () => {
    const field = new HeightField();
    field.set(10, 10, new Float32Array(65 * 65));
    field.prune({ x: 11, y: 10 }, 2);
    expect(field.has(10, 10)).toBe(true);
    field.prune({ x: 20, y: 10 }, 2);
    expect(field.has(10, 10)).toBe(false);
  });
});

describe('camera over a map', () => {
  it('is as far from the ground as the one of the scene', () => {
    const zoom = zoomForDistance(24, 47.38, 600);
    const metresPerPixel = (40075016.686 * Math.cos((47.38 * Math.PI) / 180)) / (512 * 2 ** zoom);
    // Seen from 24 m, 36.87 degrees cover 16 m.
    expect(metresPerPixel * 600).toBeCloseTo(16, 1);
    const view = backdropView('chase', 10, 0);
    const { position, target } = backdropPosition(view);
    const distance = Math.hypot(...position.map((value, i) => value - target[i]));
    expect(distance).toBeCloseTo(view.distanceM, 6);
  });

  it('looks ahead of the car in driving direction', () => {
    const view = backdropView('chase', 0, 0);
    const { center, bearing } = backdropCamera(view, ZURICH, 0, 600);
    expect((center[1] - 47.38) * METRES_PER_DEGREE_LAT).toBeCloseTo(view.lookAheadM, 3);
    expect(bearing).toBe(0);
    expect(backdropCamera(backdropView('side', 0, 0), ZURICH, 300, 600).bearing).toBe(30);
  });

  it('turns map and scene the same way', () => {
    // Map turned by 90: looking east while driving north, so the camera is in the west.
    const { position } = backdropPosition(backdropView('side', 0, 0));
    expect(position[0]).toBeLessThan(-10);
    expect(position[2]).toBeCloseTo(0, 6);
  });
});
