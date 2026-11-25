import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpPort } from '@core/http';
import { DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { GoogleNavigationService, routeFromGoogle } from './google-service';
import { evaluate } from './google-surface';

const ANSWER = {
  routes: [
    {
      duration: '600s',
      staticDuration: '480s',
      polyline: {
        geoJsonLinestring: {
          coordinates: [
            [8.54, 47.37],
            [8.54, 47.375],
            [8.55, 47.375],
          ] as [number, number][],
        },
      },
      legs: [
        {
          steps: [
            {
              startLocation: { latLng: { latitude: 47.37, longitude: 8.54 } },
              navigationInstruction: { maneuver: 'DEPART', instructions: 'Nach Norden' },
            },
            {
              startLocation: { latLng: { latitude: 47.375, longitude: 8.54 } },
              navigationInstruction: {
                maneuver: 'TURN_RIGHT',
                instructions: 'Rechts abbiegen auf Weg\nZiel rechts',
              },
            },
          ],
        },
      ],
      travelAdvisory: {
        speedReadingIntervals: [
          { endPolylinePointIndex: 1, speed: 'NORMAL' },
          { startPolylinePointIndex: 1, endPolylinePointIndex: 2, speed: 'TRAFFIC_JAM' },
        ],
      },
    },
  ],
};

describe('Google route', () => {
  it('is read with manoeuvres, delay and jams', () => {
    const route = routeFromGoogle(ANSWER);
    expect(route).toMatchObject({ provider: 'google', durationS: 600, delayS: 120 });
    expect(route.steps.map(({ maneuver }) => maneuver.type)).toEqual(['depart', 'turn', 'arrive']);
    expect(route.steps[1].text).toBe('Rechts abbiegen auf Weg');
    expect(route.steps[1].alongM).toBeCloseTo(556, -1);
    expect(route.congestion).toEqual([
      {
        level: 'jam',
        points: [
          [8.54, 47.375],
          [8.55, 47.375],
        ],
      },
    ]);
    expect(() => routeFromGoogle({})).toThrow();
  });

  it('reports a bad key and a used up quota', async () => {
    const fetch = vi.fn();
    const settings = signal({
      ...DEFAULT_SETTINGS,
      keys: { ...DEFAULT_SETTINGS.keys, google: 'AIza' },
    });
    TestBed.configureTestingModule({
      providers: [
        GoogleNavigationService,
        { provide: HttpPort, useValue: { fetch } },
        { provide: SettingsStore, useValue: { settings } },
      ],
    });
    const service = TestBed.inject(GoogleNavigationService);
    const answer = (status: number, body: object) =>
      fetch.mockResolvedValue(new Response(JSON.stringify(body), { status }));
    answer(400, { error: { message: 'API key not valid' } });
    await expect(service.route([8, 47], [9, 47])).rejects.toMatchObject({
      name: 'KeyRejectedError',
    });
    answer(403, { error: { message: 'Billing not enabled' } });
    await expect(service.search('Bern', null, 'de')).rejects.toMatchObject({
      name: 'QuotaExhaustedError',
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).not.toContain('AIza');
    expect(init.headers['x-goog-api-key']).toBe('AIza');
  });
});

describe('style expressions on the Google map', () => {
  const feature = {
    properties: { level: 'jam', icon: 'cdm-fuel' },
    geometry: { type: 'Point', coordinates: [] },
  };
  it('are the ones the scene uses', () => {
    expect(evaluate('#fff', feature)).toBe('#fff');
    expect(evaluate(['get', 'icon'], feature)).toBe('cdm-fuel');
    expect(evaluate(['match', ['get', 'level'], 'jam', 'red', 'orange'], feature)).toBe('red');
    expect(evaluate(['match', ['get', 'icon'], 'jam', 'red', 'orange'], feature)).toBe('orange');
  });
});
