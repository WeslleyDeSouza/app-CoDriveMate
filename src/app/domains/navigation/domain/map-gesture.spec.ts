import { tiltOf, twoFingerGesture } from './map-gesture';

describe('twoFingerGesture', () => {
  it('waits while the fingers have hardly moved', () => {
    expect(twoFingerGesture({ x: 2, y: -5 }, { x: 0, y: -4 })).toBeNull();
  });

  it('tilts when both go up or both go down', () => {
    expect(twoFingerGesture({ x: 2, y: -14 }, { x: -1, y: -11 })).toBe('pitch');
    expect(twoFingerGesture({ x: 0, y: 13 }, { x: 3, y: 9 })).toBe('pitch');
  });

  it('zooms when they go apart, sideways or only one moves', () => {
    expect(twoFingerGesture({ x: 0, y: -14 }, { x: 0, y: 12 })).toBe('zoom');
    expect(twoFingerGesture({ x: 14, y: 2 }, { x: 12, y: 1 })).toBe('zoom');
    expect(twoFingerGesture({ x: 0, y: -14 }, { x: 0, y: -1 })).toBe('zoom');
  });
});

describe('tiltOf', () => {
  it('takes nearly flat as flat and keeps a tilt within its limits', () => {
    expect(tiltOf(4)).toEqual({ tilted: false });
    expect(tiltOf(14)).toEqual({ tilted: true, pitch: 20 });
    expect(tiltOf(42.4)).toEqual({ tilted: true, pitch: 42 });
    expect(tiltOf(85)).toEqual({ tilted: true, pitch: 70 });
  });
});
