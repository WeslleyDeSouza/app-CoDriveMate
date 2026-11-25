import {
  DEFAULT_LIGHT,
  SCENES,
  colorFromHex,
  driveCommand,
  hexOf,
  isDriving,
  lightFromLegacy,
  parseModuleState,
  withChange,
  withScene,
  withSelection,
  zoneCommands,
} from './lighting';

describe('light protocol', () => {
  it('sends equal zones in one command', () => {
    expect(zoneCommands(DEFAULT_LIGHT.zones, [0, 1, 2, 3])).toEqual([
      Uint8Array.of(1, 15, 1, 255, 147, 41, 110, 0, 60),
    ]);
    const changed = withChange(DEFAULT_LIGHT, [1], colorFromHex('#00b4aa'));
    expect(zoneCommands(changed.zones, [0, 1, 2, 3]).map((command) => command[1])).toEqual([13, 2]);
    expect(zoneCommands(changed.zones, [1])).toEqual([
      Uint8Array.of(1, 2, 1, 0, 180, 170, 110, 0, 60),
    ]);
    expect(hexOf(changed.zones[1])).toBe('#00b4aa');
  });

  it('dims while driving', () => {
    expect(isDriving(5)).toBe(false);
    expect(isDriving(6)).toBe(true);
    expect(driveCommand(true, 77)).toEqual(Uint8Array.of(2, 77, 1));
    expect(driveCommand(false, 77)).toEqual(Uint8Array.of(2, 255, 0));
  });

  it('reads the state of the module', () => {
    expect(parseModuleState(Uint8Array.of(4, 0, 0, 138))).toEqual({ zones: 4, voltage: 13.8 });
    expect(parseModuleState(Uint8Array.of(4))).toBeNull();
  });

  it('applies scenes and keeps one zone selected', () => {
    const night = withScene(DEFAULT_LIGHT, SCENES[2]);
    expect(night.zones.map(({ on }) => on)).toEqual([true, true, false, false]);
    const off = withScene(DEFAULT_LIGHT, SCENES[SCENES.length - 1]);
    expect(off.zones.some(({ on }) => on)).toBe(false);
    const one = { ...DEFAULT_LIGHT, selected: [2] };
    expect(withSelection(one, 2).selected).toEqual([2]);
    expect(withSelection(one, 0).selected).toEqual([0, 2]);
  });

  it('reads the prototype', () => {
    const light = lightFromLegacy({
      z: [{ on: 0, r: 1, g: 2, b: 3, bri: 999, fx: 9, spd: 5 }],
      drv: 50,
    });
    expect(light.zones[0]).toEqual({
      on: false,
      r: 1,
      g: 2,
      b: 3,
      brightness: 255,
      effect: 3,
      speed: 5,
    });
    expect(light.zones).toHaveLength(4);
    expect(light.driveBrightness).toBe(50);
    expect(lightFromLegacy({})).toEqual(DEFAULT_LIGHT);
  });
});
