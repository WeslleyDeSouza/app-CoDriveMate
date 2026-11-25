import { airMassFlow, consumptionPer100Km, fuelRateLph, rangeKm } from './fuel';
import { XSARA_PICASSO } from './vehicle-profile';

const noAir = { massAirFlow: null, manifoldPressure: null, intakeTemp: null, rpm: 2000 };

describe('fuel calculation', () => {
  it('converts mass air flow to litres per hour', () => {
    // 10 g/s air / 14.7 = 0.68 g/s fuel = 2449 g/h = 3.29 l/h at 745 g/l
    expect(fuelRateLph({ ...noAir, massAirFlow: 10 }, XSARA_PICASSO)).toBeCloseTo(3.29, 2);
  });

  it('uses less volume for the same air mass with diesel', () => {
    const diesel = { ...XSARA_PICASSO, fuelType: 'diesel' as const };
    expect(fuelRateLph({ ...noAir, massAirFlow: 10 }, diesel)).toBeCloseTo(2.98, 2);
  });

  it('estimates air flow from manifold pressure when there is no MAF sensor', () => {
    // 2000 rpm, 1.8 l, 50 kPa, 20 °C: 30 l/s * 0.594 g/l * 0.8
    const air = airMassFlow({ ...noAir, manifoldPressure: 50, intakeTemp: 20 }, XSARA_PICASSO);
    expect(air).toBeCloseTo(14.26, 1);
  });

  it('prefers the MAF sensor over the estimate', () => {
    const values = { massAirFlow: 7, manifoldPressure: 50, intakeTemp: 20, rpm: 2000 };
    expect(airMassFlow(values, XSARA_PICASSO)).toBe(7);
  });

  it('gives no figure without air data', () => {
    expect(fuelRateLph(noAir, XSARA_PICASSO)).toBeNull();
  });

  it('gives consumption per 100 km only while driving', () => {
    expect(consumptionPer100Km(6, 100)).toBe(6);
    expect(consumptionPer100Km(6, 50)).toBe(12);
    expect(consumptionPer100Km(1, 0)).toBeNull();
    expect(consumptionPer100Km(null, 80)).toBeNull();
  });

  it('calculates the range from tank level', () => {
    // half of 55 l at 7 l/100 km
    expect(rangeKm(50, 7, XSARA_PICASSO)).toBeCloseTo(392.9, 1);
    expect(rangeKm(null, 7, XSARA_PICASSO)).toBeNull();
    expect(rangeKm(50, null, XSARA_PICASSO)).toBeNull();
    expect(rangeKm(50, 7, { ...XSARA_PICASSO, tankL: null })).toBeNull();
  });
});
