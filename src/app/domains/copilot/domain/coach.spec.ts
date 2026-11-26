import {
  BRAKE_QUIPS,
  CoachFacts,
  PAST_NOTES,
  PastDrive,
  pastFigures,
  pastText,
  pickEco,
  pickQuip,
  pickTip,
} from './coach';

const drive = (km: number, fuelL: number, score: number, events = 0): PastDrive => ({
  distanceKm: km,
  fuelL,
  score,
  driving: { hardBrakings: events, hardAccelerations: 0 },
});

const facts = (change: Partial<CoachFacts> = {}): CoachFacts => ({
  rangeKm: null,
  coolantC: 85,
  rpm: 2000,
  minutes: 20,
  km: 12,
  hardBrakings: 0,
  hardAccelerations: 0,
  highRpmSeconds: 0,
  idleSeconds: 0,
  score: 80,
  litresPer100: 7,
  past: { drives: 5, score: 80, litresPer100: 7, eventsPer10Km: 1 },
  ...change,
});

const first = () => 0;

describe('earlier drives', () => {
  it('are averaged from the drives long enough', () => {
    const past = pastFigures([
      drive(10, 0.7, 90, 1),
      drive(20, 1.6, 70, 3),
      drive(10, 0.9, 80, 0),
      drive(1, 0.5, 10, 9),
    ]);
    expect(past).toEqual({ drives: 3, score: 80, litresPer100: 8, eventsPer10Km: 1 });
  });

  it('say nothing when there are too few', () => {
    expect(pastFigures([drive(10, 1, 80), drive(10, 1, 80)])).toBeNull();
  });

  it('give no consumption when it was not measured', () => {
    expect(pastFigures([drive(10, 0, 80), drive(10, 0, 80), drive(10, 0, 80)])?.litresPer100).toBe(
      null,
    );
  });

  it('go to the model as averages only', () => {
    const text = pastText({ drives: 4, score: 75, litresPer100: 6.5, eventsPer10Km: 0.8 });
    expect(text).toBe(
      'average of the last 4 drives: eco score 75, 6.5 l/100 km, 0.8 hard brakings or accelerations per 10 km',
    );
  });
});

describe('tips', () => {
  it('speak about this drive first', () => {
    expect(pickTip(facts({ coolantC: 40 }), new Set(), first)).toBe('cold');
    expect(pickTip(facts({ hardBrakings: 2 }), new Set(), first)).toBe('brake_early');
    // Not much different from usual: a general tip.
    expect(pickTip(facts({ hardBrakings: 2 }), new Set(['brake_early']), first)).toBe('distance');
  });

  it('compare with earlier drives only after some kilometres', () => {
    const calm = { past: { drives: 5, score: 80, litresPer100: 7, eventsPer10Km: 2 } };
    expect(pickTip(facts(calm), new Set(), first)).toBe('calmer_than_usual');
    expect(pickTip(facts({ ...calm, km: 3 }), new Set(), first)).toBe('distance');
    expect(
      pickTip(facts({ hardBrakings: 3, hardAccelerations: 0 }), new Set(['brake_early']), first),
    ).toBe('busier_than_usual');
  });

  it('fall back to general ones, each once', () => {
    expect(pickTip(null, new Set(), first)).toBe('distance');
    expect(pickTip(null, new Set(['distance']), first)).toBe('look_ahead');
  });
});

describe('eco notes', () => {
  it('compare score and consumption with earlier drives', () => {
    expect(pickEco(facts({ score: 90 }), new Set(), first)).toBe('score_better');
    expect(pickEco(facts({ score: 65 }), new Set(), first)).toBe('score_worse');
    expect(pickEco(facts({ litresPer100: 6 }), new Set(), first)).toBe('fuel_better');
    expect(pickEco(facts({ litresPer100: 8 }), new Set(), first)).toBe('fuel_worse');
    expect(pickEco(facts({ litresPer100: null }), new Set(), first)).toBe('coast');
  });

  it('notice revs and idling', () => {
    expect(pickEco(facts({ highRpmSeconds: 40 }), new Set(), first)).toBe('shift_early');
    expect(pickEco(facts({ idleSeconds: 200 }), new Set(), first)).toBe('idle');
  });

  it('mark what compares with earlier drives', () => {
    expect(PAST_NOTES.has('score_better')).toBe(true);
    expect(PAST_NOTES.has('coast')).toBe(false);
  });

  it('run out after all were said', () => {
    const all = new Set<string>();
    for (let note = pickEco(null, all, first); note; note = pickEco(null, all, first))
      all.add(note);
    expect(all.size).toBe(8);
  });
});

describe('sayings after a hard braking', () => {
  it('do not repeat the last ones', () => {
    expect(pickQuip([0, 1, 2], first)).toBe(3);
    expect(pickQuip([], () => 0.999)).toBe(BRAKE_QUIPS - 1);
  });
});
