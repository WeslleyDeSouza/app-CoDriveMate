import {
  HAZARD_KINDS,
  Hazard,
  LonLat,
  hazardAhead,
  limitAt,
  mergeRoads,
  metresBetween,
  pointAhead,
  parseLimit,
  parseRoad,
  roadQuery,
} from './road';
import {
  TRAFFIC_KINDS,
  Incident,
  isControl,
  isUrgent,
  mergeIncidents,
  trafficKind,
} from './traffic';

const HERE: LonLat = [8.54, 47.38];
const north = (metres: number): LonLat => [8.54, 47.38 + metres / 110900];

describe('no help against speed checks', () => {
  it('is in the kinds or the query', () => {
    const words = /camera|radar|enforcement|control|police/i;
    expect(
      [...HAZARD_KINDS, ...Object.values(TRAFFIC_KINDS)].some((kind) => words.test(kind)),
    ).toBe(false);
    expect(roadQuery(HERE)).not.toMatch(words);
  });

  it('passes from third parties', () => {
    const elements = [
      { type: 'node', id: 1, lat: 47, lon: 8, tags: { highway: 'speed_camera' } },
      { type: 'node', id: 2, lat: 47, lon: 8, tags: { hazard: 'speed_camera' } },
      { type: 'node', id: 3, lat: 47, lon: 8, tags: { hazard: 'falling_rocks' } },
    ];
    expect(parseRoad({ elements })?.hazards.map(({ id }) => id)).toEqual(['node3']);
    for (const text of [
      'Radar A1',
      'Geschwindigkeitskontrolle',
      'Blitzer',
      'speed camera',
      'Contrôle',
    ]) {
      expect(isControl(text)).toBe(true);
    }
    expect(isControl('Stau zwischen Bern und Thun')).toBe(false);
    const incident = (text: string): Incident => ({
      id: text,
      kind: 'danger',
      at: HERE,
      text,
      magnitude: 0,
    });
    expect(mergeIncidents([[incident('Mobile Polizeikontrolle')]])).toEqual([]);
  });
});

describe('speed limit', () => {
  const roads = [
    { kmh: 50, points: [north(-200), north(200)] },
    { kmh: 30, points: [[8.538, 47.38] as LonLat, [8.542, 47.38] as LonLat] },
  ];

  it('reads the usual values', () => {
    expect(['50', 'CH:motorway', '30 mph', 'none', 'signals', 'walk'].map(parseLimit)).toEqual([
      50,
      120,
      48,
      null,
      null,
      7,
    ]);
  });

  it('is the one of the road in driving direction', () => {
    expect(limitAt(roads, HERE, 0, true)).toBe(50);
    expect(limitAt(roads, HERE, 180, true)).toBe(50);
    expect(limitAt(roads, HERE, 90, true)).toBe(30);
    expect(limitAt(roads, [8.6, 47.4], 0, true)).toBeNull();
  });
});

describe('hazards', () => {
  const hazard = (kind: Hazard['kind'], metres: number): Hazard => ({
    id: kind + metres,
    kind,
    at: north(metres),
  });
  const tuesday = new Date(2026, 10, 24, 10);

  it('are named when ahead and near enough', () => {
    const list = [hazard('level_crossing', 300), hazard('falling_rocks', 390)];
    expect(hazardAhead(list, HERE, 0, 60, tuesday)?.hazard.kind).toBe('level_crossing');
    expect(hazardAhead(list, HERE, 180, 60, tuesday)).toBeNull();
    expect(hazardAhead(list, HERE, 0, 5, tuesday)).toBeNull();
    expect(hazardAhead([hazard('level_crossing', 380)], HERE, 0, 60, tuesday)).toBeNull();
  });

  it('come from all cells, each once', () => {
    const data = { hazards: [hazard('curve', 100)], roads: [] };
    expect(mergeRoads([data, data]).hazards).toHaveLength(1);
    expect(metresBetween(HERE, pointAhead(HERE, 90, 500))).toBeCloseTo(500, 0);
  });

  it('include schools only on weekdays at daytime', () => {
    const school = [hazard('school', 150)];
    expect(hazardAhead(school, HERE, 0, 40, tuesday)).not.toBeNull();
    expect(hazardAhead(school, HERE, 0, 40, new Date(2026, 10, 24, 21))).toBeNull();
    expect(hazardAhead(school, HERE, 0, 40, new Date(2026, 10, 22, 10))).toBeNull();
  });
});

describe('traffic', () => {
  const incident = (id: string, metres: number, change: Partial<Incident> = {}): Incident => ({
    id,
    kind: 'jam',
    at: north(metres),
    text: id,
    magnitude: 0,
    ...change,
  });

  it('appears once, also from two sources', () => {
    expect(
      mergeIncidents([[incident('a', 0)], [incident('b', 50), incident('c', 900)]]).map(
        ({ id }) => id,
      ),
    ).toEqual(['a', 'c']);
    expect(trafficKind(8)).toBe('road_closed');
    expect(trafficKind(99)).toBeNull();
  });

  it('is said only when it matters', () => {
    expect(isUrgent(incident('a', 0), 2000)).toBe(false);
    expect(isUrgent(incident('a', 0, { magnitude: 3 }), 4000)).toBe(true);
    expect(isUrgent(incident('a', 0, { kind: 'accident' }), 2500)).toBe(true);
    expect(isUrgent(incident('a', 0, { kind: 'roadworks', magnitude: 4 }), 500)).toBe(false);
  });
});
