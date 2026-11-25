import { speeding } from './speeding';

describe('speeding', () => {
  it('warns above the tolerance and becomes critical from 10 km/h', () => {
    expect(speeding(53, 50)).toBeNull();
    expect(speeding(56, 50)).toBe('warn');
    expect(speeding(59, 50)).toBe('warn');
    expect(speeding(60, 50)).toBe('crit');
    expect(speeding(65, 50)).toBe('crit');
  });

  it('says nothing without a limit', () => {
    expect(speeding(150, null)).toBeNull();
  });
});
