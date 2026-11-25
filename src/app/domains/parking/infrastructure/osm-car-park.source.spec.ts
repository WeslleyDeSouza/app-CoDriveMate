import { TestBed } from '@angular/core/testing';
import { HttpPort } from '@core/http';
import { OsmCarParkSource } from './osm-car-park.source';

describe('OsmCarParkSource', () => {
  let answers: Record<string, unknown>;

  beforeEach(() => {
    const getJson = async (url: string) => {
      const host = Object.keys(answers).find((name) => url.includes(name));
      if (!host) throw new Error('unreachable');
      return { ok: true, status: 200, body: answers[host] };
    };
    TestBed.configureTestingModule({
      providers: [OsmCarParkSource, { provide: HttpPort, useValue: { getJson } }],
    });
  });

  const around = () => TestBed.inject(OsmCarParkSource).around([8.54, 47.38]);

  it('reads Photon', async () => {
    answers = {
      photon: {
        features: [
          {
            geometry: { coordinates: [8.5, 47.3] },
            properties: { osm_type: 'W', osm_id: 7, name: 'Urania', street: 'Weg', city: 'Zürich' },
          },
        ],
      },
    };
    expect(await around()).toEqual([
      { id: 'W7', name: 'Urania', address: 'Weg, Zürich', at: [8.5, 47.3] },
    ]);
  });

  it('falls back to Overpass', async () => {
    answers = {
      interpreter: {
        elements: [
          { type: 'way', id: 7, center: { lat: 47.3, lon: 8.5 }, tags: { name: 'Urania' } },
          { type: 'node', id: 8, lat: 47.4, lon: 8.6 },
          { type: 'relation', id: 9 },
        ],
      },
    };
    expect((await around()).map(({ id, at }) => [id, at])).toEqual([
      ['W7', [8.5, 47.3]],
      ['N8', [8.6, 47.4]],
    ]);
  });

  it('rejects when nothing answers', async () => {
    answers = {};
    await expect(around()).rejects.toThrow();
  });
});
