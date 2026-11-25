import { TestBed } from '@angular/core/testing';
import { HttpPort } from '@core/http';
import { CacheStore } from '@core/storage';
import { OpenFreeMap } from './open-free-map';

const INDEX = { tiles: ['https://tiles.openfreemap.org/planet/new/{z}/{x}/{y}.pbf'] };
const bytes = (...values: number[]) => new Uint8Array(values).buffer;

describe('OpenFreeMap', () => {
  let online: boolean;
  let asked: string[];
  let entries: Map<string, { fetchedAt: number; value: ArrayBuffer }>;
  let map: OpenFreeMap;

  beforeEach(() => {
    online = true;
    asked = [];
    entries = new Map();
    const request = (url: string) => {
      asked.push(url);
      if (!online) throw new Error('unreachable');
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: HttpPort,
          useValue: {
            getJson: async (url: string) => {
              request(url);
              return { ok: true, status: 200, body: INDEX };
            },
            getBlob: async (url: string) => {
              request(url);
              return { arrayBuffer: async () => bytes(1, 2) };
            },
          },
        },
        {
          provide: CacheStore,
          useValue: {
            get: async (bucket: string, key: string) => entries.get(bucket + ' ' + key),
            put: async (
              bucket: string,
              key: string,
              value: { fetchedAt: number; value: ArrayBuffer },
            ) => void entries.set(bucket + ' ' + key, value),
            prune: async () => 0,
          },
        },
      ],
    });
    map = TestBed.inject(OpenFreeMap);
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

  it('keeps tiles, whatever build of the map they come from', async () => {
    const url = (build: string) => `https://tiles.openfreemap.org/planet/${build}/14/8/5.pbf`;
    expect(await map.resource(url('old'))).not.toBeNull();
    expect(asked[1]).toBe(url('new'));
    expect([...entries.keys()]).toContain('vector 14/8/5');
    online = false;
    expect(await map.resource(url('other'))).not.toBeNull();
    expect(await map.tile(14, 8, 5)).not.toBeNull();
    expect(asked).toHaveLength(2);
  });

  it('keeps style and tile list for the time without a network', async () => {
    const style = 'https://tiles.openfreemap.org/styles/dark';
    const index = 'https://tiles.openfreemap.org/planet';
    await map.resource(style);
    await map.resource(index);
    online = false;
    expect(await map.resource(style)).not.toBeNull();
    const list = await map.resource(index);
    expect(list && JSON.parse(new TextDecoder().decode(list))).toEqual(INDEX);
  });

  it('has nothing for a place never loaded', async () => {
    online = false;
    expect(await map.tile(14, 1, 1)).toBeNull();
    expect(await map.resource('https://tiles.openfreemap.org/styles/dark')).toBeNull();
  });

  it('shows an old tile at once and renews it', async () => {
    entries.set('vector-overview 10/1/1', { fetchedAt: 0, value: bytes(9) });
    const tile = await map.tile(10, 1, 1);
    expect(tile && [...new Uint8Array(tile)]).toEqual([9]);
    await settle();
    expect(entries.get('vector-overview 10/1/1')?.fetchedAt).toBeGreaterThan(0);
  });
});
