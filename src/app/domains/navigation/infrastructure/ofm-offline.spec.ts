import { TestBed } from '@angular/core/testing';
import { OpenFreeMap } from '@core/map';
import { Coordinate } from '../domain/geo';
import { tilesAlong } from '../domain/map-tiles';
import { tileAt } from '../domain/road-graph';
import { OfmOfflineSaver } from './ofm-offline.saver';

const A: Coordinate = [8.5, 47.3];
const B: Coordinate = [8.7, 47.4];

describe('tilesAlong', () => {
  it('covers a long straight without gaps', () => {
    const tiles = new Set(tilesAlong([A, B], 14, 14, 9999).map(({ x, y }) => `${x}/${y}`));
    for (let share = 0; share <= 1; share += 0.01) {
      const at: Coordinate = [A[0] + 0.2 * share, A[1] + 0.1 * share];
      const { x, y } = tileAt(at);
      expect(tiles.has(`${x}/${y}`)).toBe(true);
    }
  });

  it('starts with the overview and respects the limit', () => {
    const tiles = tilesAlong([A, B], 4, 14, 50);
    expect(tiles).toHaveLength(50);
    expect(tiles[0].z).toBe(4);
    expect(tilesAlong([], 4, 14, 50)).toEqual([]);
  });
});

describe('OfmOfflineSaver', () => {
  const style = {
    sprite: 'https://tiles.openfreemap.org/sprites/a',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    layers: [{ layout: { 'text-font': ['Noto Sans Regular'] } }, {}],
  };
  let resources: string[];
  let reachable: boolean;
  const job = { progress: () => undefined, cancelled: () => false };

  beforeEach(() => {
    resources = [];
    reachable = true;
    TestBed.configureTestingModule({
      providers: [
        OfmOfflineSaver,
        {
          provide: OpenFreeMap,
          useValue: {
            resource: async (url: string) => {
              resources.push(url);
              return reachable ? new TextEncoder().encode(JSON.stringify(style)).buffer : null;
            },
            tile: async () => (reachable ? new ArrayBuffer(1) : null),
          },
        },
      ],
    });
  });

  it('saves style, icons, fonts and tiles', async () => {
    expect(await TestBed.inject(OfmOfflineSaver).save([A, B], job)).toBe(true);
    expect(resources).toContain('https://tiles.openfreemap.org/sprites/a@2x.png');
    expect(resources).toContain(
      'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf',
    );
    expect(resources).toContain('https://tiles.openfreemap.org/planet');
  });

  it('is incomplete without a network', async () => {
    reachable = false;
    expect(await TestBed.inject(OfmOfflineSaver).save([A, B], job)).toBe(false);
  });
});
