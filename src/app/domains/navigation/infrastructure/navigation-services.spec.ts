import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpPort, HttpResult } from '@core/http';
import { DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { MapboxNavigationService, OsmNavigationService } from './navigation-services';

class FakeHttp {
  urls: string[] = [];
  body: unknown = null;
  async getJson(url: string): Promise<HttpResult> {
    this.urls.push(url);
    return { ok: true, status: 200, body: this.body } as HttpResult;
  }
}

describe('place search services', () => {
  let http: FakeHttp;

  beforeEach(() => {
    http = new FakeHttp();
    const settings = { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_SETTINGS.keys, mapbox: 'pk.test' } };
    TestBed.configureTestingModule({
      providers: [
        MapboxNavigationService,
        OsmNavigationService,
        { provide: HttpPort, useValue: http },
        { provide: SettingsStore, useValue: { settings: signal(settings) } },
      ],
    });
  });

  it('asks the Search Box of Mapbox, which knows businesses', async () => {
    http.body = {
      features: [
        {
          geometry: { coordinates: [8.524, 47.363] },
          properties: {
            name: 'Hürlimannbad',
            full_address: 'Hürlimannbad, Brandschenkestrasse 150, 8002 Zürich, Schweiz',
          },
        },
      ],
    };
    const [place] = await TestBed.inject(MapboxNavigationService).search(
      'Hürlimannbad',
      [8.54, 47.37],
      'de',
    );
    expect(http.urls[0]).toContain('/search/searchbox/v1/forward?q=H%C3%BCrlimannbad');
    expect(http.urls[0]).toContain('proximity=8.540000,47.370000');
    expect(place).toEqual({
      name: 'Hürlimannbad',
      detail: 'Brandschenkestrasse 150, 8002 Zürich, Schweiz',
      coordinate: [8.524, 47.363],
      source: 'mapbox',
    });
  });

  it('leaves out wild guesses of Photon', async () => {
    const feature = (name: string, street: string, city = 'Zürich') => ({
      geometry: { coordinates: [8.5, 47.4] },
      properties: { name, street, city },
    });
    http.body = {
      features: [
        feature('Zue Rich Barber Club', 'Hardstrasse'),
        feature('Lionsoul Zürich', 'Hardgutstrasse'),
      ],
    };
    const found = await TestBed.inject(OsmNavigationService).suggest('Lionsoul Zürich', null, 'de');
    expect(found.map(({ name }) => name)).toEqual(['Lionsoul Zürich']);
  });
});
