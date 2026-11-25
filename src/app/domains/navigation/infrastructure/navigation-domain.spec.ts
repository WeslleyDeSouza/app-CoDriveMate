import { routeFromOsrm } from './osrm-format';
import { Coordinate, bearing, distanceM, panCenter, pointAt, polyline, snap } from '../domain/geo';
import {
  AnnouncementPlan,
  Progress,
  announcementsAhead,
  OffRouteDetector,
  formatDuration,
  maneuverKey,
  progressOn,
} from '../domain/guidance';
import { chooseMap } from '../domain/map-choice';
import { NoRouteError, Route } from '../domain/route';

const A: Coordinate = [8.54, 47.37];
const B: Coordinate = [8.54, 47.38]; // ~1112 m north
const C: Coordinate = [8.555, 47.38]; // ~1129 m east

const osrm = {
  code: 'Ok',
  routes: [
    {
      duration: 220,
      duration_typical: 180,
      geometry: { coordinates: [A, B, C] as [number, number][] },
      legs: [
        {
          annotation: { congestion: ['low', 'heavy'] },
          steps: [
            { name: 'Start', maneuver: { type: 'depart', location: A } },
            { name: 'Quer', maneuver: { type: 'turn', modifier: 'right', location: B } },
            { maneuver: { type: 'arrive', location: C } },
          ],
        },
      ],
    },
  ],
};
const route = routeFromOsrm(osrm, 'mapbox');

describe('geo', () => {
  it('measures distance and bearing', () => {
    expect(distanceM(A, B)).toBeCloseTo(1112, -1);
    expect(bearing(A, B)).toBeCloseTo(0, 5);
    expect(bearing(B, C)).toBeCloseTo(90, 1);
  });

  it('snaps to the line and finds points on it', () => {
    const line = polyline([A, B, C]);
    const at = snap(line, [8.541, 47.375]);
    expect(at.alongM).toBeCloseTo(556, -1);
    expect(at.offsetM).toBeCloseTo(75, 0);
    expect(pointAt(line, 99999).point).toEqual(C);
    expect(pointAt(polyline([A]), 5)).toEqual({ point: A, heading: 0 });
  });

  it('pans against the drag direction, also on a rotated map', () => {
    const north = panCenter(A, 15, 0, 0, 100, 0);
    expect(north[0]).toBeLessThan(A[0]);
    expect(north[1]).toBeCloseTo(A[1], 8);
    const east = panCenter(A, 15, 90, 0, 0, 100);
    expect(east[0]).toBeGreaterThan(A[0]);
    expect(east[1]).toBeCloseTo(A[1], 8);
  });
});

describe('route format', () => {
  it('reads duration, delay, steps and congestion', () => {
    expect(route).toMatchObject({ provider: 'mapbox', durationS: 220, delayS: 40 });
    expect(route.steps.map((s) => Math.round(s.alongM / 100))).toEqual([0, 11, 22]);
    expect(route.congestion).toEqual([{ level: 'jam', points: [B, C] }]);
  });

  it('rejects an answer without a route', () => {
    expect(() => routeFromOsrm({ code: 'NoRoute' }, 'osm')).toThrow(NoRouteError);
    expect(() => routeFromOsrm(null, 'osm')).toThrow(NoRouteError);
  });
});

describe('guidance', () => {
  it('reports the next manoeuvre and what remains', () => {
    const p = progressOn(route, [8.54, 47.375]);
    expect(p.next.street).toBe('Quer');
    expect(p.then?.maneuver.type).toBe('arrive');
    expect(p.street).toBe('Start');
    expect(p.distanceM).toBeCloseTo(556, -1);
    expect(p.remainingS).toBeLessThan(route.durationS);
    expect(p.arrived).toBe(false);
    expect(progressOn(route, C).arrived).toBe(true);
  });

  it('does not jump where the route passes the same place again', () => {
    const loop = routeFromOsrm(
      {
        routes: [
          {
            duration: 600,
            geometry: { coordinates: [A, B, C, B, A] },
            legs: [
              {
                steps: [
                  { maneuver: { type: 'depart', location: A } },
                  { maneuver: { type: 'arrive', location: A } },
                ],
              },
            ],
          },
        ],
      },
      'osm',
    );
    expect(progressOn(loop, A, 4400).alongM).toBeGreaterThan(4000);
    expect(progressOn(loop, A, 0).arrived).toBe(false);
  });

  it('announces every distance once', () => {
    const plan = new AnnouncementPlan();
    const at = (distanceM: number) => ({ ...progressOn(route, A), stepIndex: 1, distanceM });
    expect(plan.next(at(900))).toBeNull();
    expect(plan.next(at(790))).toMatchObject({ immediate: false });
    expect(plan.next(at(500))).toBeNull();
    expect(plan.next(at(299))).toMatchObject({ immediate: false });
    expect(plan.next(at(50))).toMatchObject({ immediate: true });
    expect(plan.next(at(40))).toBeNull();
  });

  it('says a round figure only where it is true', () => {
    const said = (distanceM: number) =>
      new AnnouncementPlan().next({ stepIndex: 1, distanceM } as Progress)?.spokenM;
    expect(said(790)).toBe(800);
    expect(said(500)).toBe(500);
    expect(said(290)).toBe(300);
    expect(said(180)).toBe(200);
  });

  it('knows beforehand what will be said', () => {
    const step = (alongM: number) => ({
      maneuver: { type: 'turn', modifier: 'left', exit: null },
      street: '',
      alongM,
    });
    const route = { steps: [step(0), step(2000), step(2415), step(2500), step(9000)] } as unknown as Route;
    const ahead = announcementsAhead(route, { stepIndex: 1, alongM: 500 }, 3);
    expect(
      ahead.map(({ step: { alongM }, spokenM, immediate }) => [alongM, immediate || spokenM]),
    ).toEqual([
      [2000, 800],
      [2000, 300],
      [2000, true],
      [2415, 400],
      [2415, 300],
      [2415, true],
      [2500, 50],
      [2500, true],
    ]);
    const near = announcementsAhead(route, { stepIndex: 1, alongM: 1800 }, 1);
    expect(near.map(({ immediate }) => immediate)).toEqual([false, true]);
  });

  it('starting close to a turn announces only the nearest distance', () => {
    const plan = new AnnouncementPlan();
    const at = (distanceM: number) => ({ ...progressOn(route, A), stepIndex: 1, distanceM });
    expect(plan.next(at(40))).toMatchObject({ immediate: true });
    expect(plan.next(at(41))).toBeNull();
  });

  it('reroutes only after some seconds off the route', () => {
    const detector = new OffRouteDetector();
    expect(detector.shouldReroute(100, 1000)).toBe(false);
    expect(detector.shouldReroute(10, 3000)).toBe(false);
    expect(detector.shouldReroute(100, 4000)).toBe(false);
    expect(detector.shouldReroute(100, 9500)).toBe(true);
    expect(detector.shouldReroute(100, 10000)).toBe(false);
    expect(detector.shouldReroute(100, 16000)).toBe(false);
    expect(detector.shouldReroute(100, 25000)).toBe(true);
  });

  it('names manoeuvres', () => {
    const key = (type: string, modifier = '', exit: number | null = null) =>
      maneuverKey({ type, modifier, exit });
    expect(key('turn', 'sharp left')).toBe('do.sharp_left');
    expect(key('roundabout', 'right', 2)).toBe('do.roundabout_exit');
    expect(key('fork', 'slight right')).toBe('do.keep_right');
    expect(key('new name')).toBe('do.keep_straight');
    expect(key('end of road', 'left')).toBe('do.left');
  });

  it('formats the duration', () => {
    expect(formatDuration(20)).toBe('1 min');
    expect(formatDuration(3590)).toBe('1 h 0 min');
    expect(formatDuration(5400)).toBe('1 h 30 min');
  });
});

describe('chooseMap', () => {
  const auto = { baseMap: 'auto', routingProvider: 'auto' } as const;

  it('prefers Mapbox when there is a usable token', () => {
    expect(chooseMap(auto, true)).toBe('mapbox');
    expect(chooseMap(auto, false)).toBe('ofm');
  });

  it('uses Google only when asked for and usable', () => {
    expect(chooseMap(auto, true, true)).toBe('mapbox');
    expect(chooseMap({ ...auto, baseMap: 'google' }, true, true)).toBe('google');
    expect(chooseMap({ ...auto, routingProvider: 'google' }, true, true)).toBe('google');
    expect(chooseMap({ ...auto, baseMap: 'google' }, true, false)).toBe('mapbox');
    expect(chooseMap({ ...auto, baseMap: 'google' }, false, false)).toBe('ofm');
    expect(chooseMap({ baseMap: 'ofm', routingProvider: 'google' }, true, true)).toBe('ofm');
  });

  it('follows an explicit choice', () => {
    expect(chooseMap({ ...auto, baseMap: 'mapboxnav' }, true)).toBe('mapboxnav');
    expect(chooseMap({ ...auto, baseMap: 'mapboxnav' }, false)).toBe('ofm');
    expect(chooseMap({ ...auto, baseMap: 'ofm' }, true)).toBe('ofm');
    expect(chooseMap({ ...auto, routingProvider: 'osm' }, true)).toBe('ofm');
  });
});
