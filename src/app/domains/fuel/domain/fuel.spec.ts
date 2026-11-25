import { isOpen } from './opening-hours';
import { Station, mergeStations, rateStations } from './stations';
import {
  LowFuelWarning,
  UNKNOWN_TANK,
  afterDriving,
  averagePer100Km,
  litresIn,
  rangeKm,
} from './tank';

describe('tank', () => {
  it('trusts the sensor first, then what was counted', () => {
    expect(litresIn({ ...UNKNOWN_TANK, litres: 30 }, 50, 55)).toBe(27.5);
    expect(litresIn({ ...UNKNOWN_TANK, litres: 30 }, null, 55)).toBe(30);
    expect(litresIn(UNKNOWN_TANK, null, 55)).toBeNull();
  });

  it('counts used fuel and learns the average', () => {
    let state = { ...UNKNOWN_TANK, litres: 40 };
    expect(averagePer100Km(state)).toBe(8);
    for (let i = 0; i < 3600; i++)
      state = { ...afterDriving(state, 1, 60, 6), litres: state.litres - 6 / 3600 };
    expect(state.km).toBeCloseTo(60, 3);
    expect(averagePer100Km(state)).toBeCloseTo(10, 2);
    expect(afterDriving({ ...UNKNOWN_TANK, litres: 0.0001 }, 10, 50, 9).litres).toBe(0);
    expect(afterDriving(state, 1, 60, null)).toBe(state);
    expect(rangeKm(40, 8)).toBe(500);
    expect(rangeKm(null, 8)).toBeNull();
  });

  it('warns once, and again after refuelling', () => {
    const warning = new LowFuelWarning();
    expect([null, 200, 79, 70, 100, 60, 400, 79].map((range) => warning.next(range))).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      true,
    ]);
  });
});

describe('opening hours', () => {
  // 24.11.2026 is a Tuesday
  const at = (day: number, time: string) => new Date(`2026-11-${day}T${time}:00`);

  it('reads the usual forms', () => {
    expect(isOpen('24/7', at(24, '03:00'))).toBe(true);
    const hours = 'Mo-Fr 06:00-22:00; Sa,Su 08:00-20:00';
    expect(isOpen(hours, at(24, '05:59'))).toBe(false);
    expect(isOpen(hours, at(24, '21:59'))).toBe(true);
    expect(isOpen(hours, at(29, '21:00'))).toBe(false);
    expect(isOpen('06:00-12:00,13:00-19:00', at(24, '12:30'))).toBe(false);
    expect(isOpen('Mo-Su 05:00-01:00', at(24, '00:30'))).toBe(true);
    expect(isOpen('Mo-Sa 07:00-20:00; Su off', at(29, '10:00'))).toBe(false);
  });

  it('does not guess', () => {
    expect(isOpen('', at(24, '10:00'))).toBeNull();
    expect(isOpen('sunrise-sunset', at(24, '10:00'))).toBeNull();
    expect(isOpen('Mo-Fr by appointment', at(24, '10:00'))).toBeNull();
  });
});

describe('stations', () => {
  const station = (id: string, change: Partial<Station> = {}): Station => ({
    id,
    name: id,
    address: '',
    at: [8, 47],
    openingHours: '',
    lacks: [],
    ...change,
  });

  it('joins quick and detailed answers', () => {
    const merged = mergeStations(
      [station('N1', { address: 'Weg 1' }), station('N2')],
      [station('N1', { openingHours: '24/7' }), station('N3')],
    );
    expect(merged.map(({ id }) => id)).toEqual(['N1', 'N2', 'N3']);
    expect(merged[0]).toMatchObject({ address: 'Weg 1', openingHours: '24/7' });
  });

  it('shows the nearest that fit, closed ones last', () => {
    const distance: Record<string, number> = { N1: 100, N2: 200, N3: 300, N4: 50 };
    const rated = rateStations(
      [
        station('N1', { openingHours: 'off' }),
        station('N3'),
        station('N2'),
        station('N4', { lacks: ['petrol'] }),
      ],
      'petrol',
      ({ id }) => distance[id],
      new Date(),
      5,
    );
    expect(rated.map(({ id }) => id)).toEqual(['N2', 'N3', 'N1']);
  });
});
