import { parseCleared, parseCodes, parseLamp } from './fault-codes';
import { VehicleState, WarningMonitor, vehicleWarnings } from './warnings';

describe('fault codes', () => {
  it('reads the warning lamp', () => {
    expect(parseLamp('41 01 81 07 65 04')).toBe(true);
    expect(parseLamp('SEARCHING...\r41010007E500')).toBe(false);
    expect(parseLamp('NO DATA')).toBeNull();
  });

  it('reads codes of old and CAN cars', () => {
    expect(parseCodes('43 01 71 03 01 00 00')).toEqual(['P0171', 'P0301']);
    expect(parseCodes('43 02 01 71 C1 00')).toEqual(['P0171', 'U0100']);
    expect(parseCodes('43 01 71 00 00 00 00\r43 01 71 00 00 00 00')).toEqual(['P0171']);
    expect(parseCodes('43 00 00 00 00 00 00')).toEqual([]);
    expect(parseCodes('NO DATA')).toEqual([]);
    expect(parseCodes('TIMEOUT')).toBeNull();
  });

  it('needs the confirmation of the car', () => {
    expect(parseCleared('44')).toBe(true);
    expect(parseCleared('7F 04 22')).toBe(false);
  });
});

describe('warnings', () => {
  const car: VehicleState = {
    connected: true,
    rpm: 2000,
    coolantC: 90,
    voltage: 14,
    rangeKm: 300,
    lamp: false,
    codes: [],
  };
  const ids = (change: Partial<VehicleState>) =>
    vehicleWarnings({ ...car, ...change }).map(({ id, level }) => id + ':' + level);

  it('follow the limits', () => {
    expect(ids({})).toEqual([]);
    expect(ids({ coolantC: 101 })).toEqual(['coolant_warm:warn']);
    expect(ids({ coolantC: 108 })).toEqual(['coolant_hot:crit']);
    expect(ids({ voltage: 15.3 })).toEqual(['charge_high:crit']);
    expect(ids({ voltage: 12.1 })).toEqual(['charge_low:warn']);
    expect(ids({ voltage: 12.1, rpm: 0 })).toEqual([]);
    expect(ids({ rangeKm: 25 })).toEqual(['range:warn']);
    expect(ids({ rangeKm: 5 })).toEqual(['range:crit']);
    expect(ids({ lamp: true })).toEqual(['lamp:warn']);
    expect(ids({ coolantC: null, voltage: null, rangeKm: null, lamp: null })).toEqual([]);
    expect(ids({ connected: false, coolantC: 120 })).toEqual([]);
  });

  it('need three seconds and are confirmed once', () => {
    const monitor = new WarningMonitor();
    const low = vehicleWarnings({ ...car, voltage: 12 });
    expect(monitor.next(low, 0).shown).toBeNull();
    expect(monitor.next(low, 3000).shown?.id).toBe('charge_low');
    monitor.confirm('charge_low', 3000);
    expect(monitor.next(low, 9_000_000)).toMatchObject({
      shown: null,
      active: [{ id: 'charge_low' }],
    });
    monitor.next([], 9_000_001);
    monitor.next(low, 9_000_002);
    expect(monitor.next(low, 9_010_000).shown?.id).toBe('charge_low');
  });

  it('show the critical one first, and again after ten minutes', () => {
    const monitor = new WarningMonitor();
    const both = vehicleWarnings({ ...car, voltage: 12, coolantC: 110 }).reverse();
    monitor.next(both, 0);
    expect(monitor.next(both, 3000).shown?.id).toBe('coolant_hot');
    monitor.confirm('coolant_hot', 3000);
    expect(monitor.next(both, 4000).shown?.id).toBe('charge_low');
    monitor.confirm('charge_low', 4000);
    expect(monitor.next(both, 5000).shown).toBeNull();
    expect(monitor.next(both, 700_000).shown?.id).toBe('coolant_hot');
  });
});
