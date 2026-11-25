import { ecoScore, tripFromLegacy } from './trip';

const calm = { hardAccelerations: 0, hardBrakings: 0, highRpmSeconds: 0, idleSeconds: 0 };

describe('ecoScore', () => {
  it('is 100 for a calm drive', () => {
    expect(ecoScore(20, calm)).toBe(100);
  });

  it('subtracts penalties per 10 km', () => {
    // (2*3 + 1*4 + 80/8 + 40/40) * 10 / 10 km = 21
    const style = { hardAccelerations: 2, hardBrakings: 1, highRpmSeconds: 80, idleSeconds: 40 };
    expect(ecoScore(10, style)).toBe(79);
  });

  it('scores very short trips as 3 km and never goes below 0', () => {
    expect(ecoScore(0.5, { ...calm, hardBrakings: 3 })).toBe(60);
    expect(ecoScore(1, { ...calm, hardBrakings: 50 })).toBe(0);
  });
});

describe('tripFromLegacy', () => {
  it('maps a prototype record', () => {
    const trip = tripFromLegacy({
      id: 1700000000000,
      t0: 1700000000000,
      t1: 1700000900000,
      dist: 12.4,
      fuel: 0.9,
      vmax: 84,
      hA: 1,
      hB: 2,
      rpmS: 16,
      idleS: 80,
      p: [
        [7.44, 46.95],
        [7.45, 46.96],
      ],
      from: 'Bundesplatz',
      to: 'Wankdorf',
      src: 'obd',
      price: 1.85,
      score: 88,
      cost: 1.665,
    });

    expect(trip).toMatchObject({
      id: 1700000000000,
      startedAt: 1700000000000,
      endedAt: 1700000900000,
      distanceKm: 12.4,
      fuelL: 0.9,
      maxSpeedKmh: 84,
      from: 'Bundesplatz',
      to: 'Wankdorf',
      source: 'obd',
      score: 88,
      cost: 1.665,
      end: [7.45, 46.96],
    });
    expect(trip.driving).toEqual({
      hardAccelerations: 1,
      hardBrakings: 2,
      highRpmSeconds: 16,
      idleSeconds: 80,
    });
  });

  it('fills what an old record lacks', () => {
    const trip = tripFromLegacy({ id: 5, dist: 10, fuel: 1, price: 2 });
    expect(trip.startedAt).toBe(5);
    expect(trip.cost).toBe(2);
    expect(trip.score).toBe(100);
    expect(trip.source).toBe('gps');
    expect(trip.end).toBeNull();
  });
});
