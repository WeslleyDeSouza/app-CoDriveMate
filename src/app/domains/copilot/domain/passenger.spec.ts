import {
  PERSONAS,
  PastTrip,
  RideFacts,
  SERIAL_EPISODES,
  Serial,
  TOPICS,
  Topic,
  briefingParts,
  character,
  isYes,
  jamOpening,
  opening,
  pickRemark,
  pickTopic,
  rideText,
  serialOpening,
  usualDestination,
  withEpisode,
} from './passenger';

describe('who the passenger is', () => {
  it('has a name and a character of its own, for each choice', () => {
    const all = PERSONAS.map(character);
    expect(new Set(all).size).toBe(PERSONAS.length);
    expect(character('dry')).toContain('Ruth');
    all.forEach((text) => expect(text).toMatch(/^Your name is \w+\. Character: /));
  });

  it('tells a story in episodes and ends it', () => {
    expect(serialOpening('monologue', null)).toContain('episode 1');
    expect(serialOpening('monologue', null)).toContain('do not ask anything');
    let serial: Serial | null = withEpisode(null, '  Frau  Gygax fand den Schlüssel. ');
    expect(serial).toEqual({ episode: 1, last: 'Frau Gygax fand den Schlüssel.' });
    const next = serialOpening('dialogue', serial);
    expect(next).toContain('episode 2');
    expect(next).toContain('"Frau Gygax fand den Schlüssel."');
    expect(next).toContain('asking the driver how it should go on');
    for (let i = 2; i < SERIAL_EPISODES; i++) serial = withEpisode(serial, 'Folge ' + i);
    expect(serial?.episode).toBe(SERIAL_EPISODES - 1);
    expect(serialOpening('monologue', serial)).toContain('surprising end');
    expect(withEpisode(serial, 'Ende')).toBeNull();
    expect(withEpisode(null, 'x'.repeat(2000))?.last).toHaveLength(700);
  });

  it('offers something to pass the time when the car stands, and briefs at the start', () => {
    expect(jamOpening('dialogue')).toContain('let the driver choose');
    expect(jamOpening('monologue')).toContain('do not ask anything');
    expect(briefingParts(0, 0)).toEqual([]);
    expect(briefingParts(2, 0)).toEqual([]);
    expect(briefingParts(7, 2)).toEqual(['traffic', 'service']);
    expect(briefingParts(0, 1)).toEqual(['service']);
  });
});

const RIDE: RideFacts = {
  rangeKm: 300,
  coolantC: 88,
  rpm: 2000,
  minutes: 10,
  km: 5,
  hardBrakings: 0,
  hardAccelerations: 0,
  highRpmSeconds: 0,
  idleSeconds: 0,
};

describe('topics', () => {
  it('do not repeat until all were used', () => {
    const recent = Object.keys(TOPICS).slice(1) as Topic[];
    expect(pickTopic(recent, () => 0.9)).toBe('region');
    expect(pickTopic([...recent, 'region'], () => 0)).toBe('region');
  });

  it('are only told in a monologue', () => {
    expect(opening('monologue', 'story', true)).toContain('do not ask anything');
    expect(opening('dialogue', 'story', false)).toContain('said nothing');
  });
});

describe('remarks about the drive', () => {
  it('say the most important thing first, and each only once', () => {
    const ride = { ...RIDE, rangeKm: 40, hardBrakings: 4 };
    expect(pickRemark(ride, new Set())).toBe('tank');
    expect(pickRemark(ride, new Set(['tank']))).toBe('braking');
    expect(pickRemark(ride, new Set(['tank', 'braking']))).toBeNull();
  });

  it('are made only when there is something to say', () => {
    expect(pickRemark(RIDE, new Set())).toBeNull();
    expect(pickRemark({ ...RIDE, rangeKm: null, coolantC: null }, new Set())).toBeNull();
    expect(pickRemark({ ...RIDE, coolantC: 30 }, new Set())).toBeNull();
    expect(pickRemark({ ...RIDE, coolantC: 30, rpm: 3500 }, new Set())).toBe('cold');
    expect(pickRemark({ ...RIDE, minutes: 125 }, new Set())).toBe('pause');
    expect(pickRemark({ ...RIDE, km: 12 }, new Set())).toBe('smooth');
  });

  it('tell the model figures only', () => {
    expect(rideText({ ...RIDE, hardBrakings: 2 })).toBe(
      '5 km in 10 min, hard brakings: 2, hard accelerations: 0',
    );
  });
});

describe('usual destination', () => {
  const flat = (a: readonly [number, number], b: readonly [number, number]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]) * 100_000;
  const monday = new Date(2026, 10, 23, 7, 30).getTime();
  const day = 86_400_000;
  const trip = (change: Partial<PastTrip> = {}): PastTrip => ({
    startedAt: monday - 7 * day,
    from: [8, 47],
    end: [8.1, 47],
    to: 'Werkstrasse',
    ...change,
  });
  const find = (trips: PastTrip[], at: readonly [number, number] = [8, 47]) =>
    usualDestination(trips, at, monday, flat);

  it('needs several drives from here', () => {
    expect(find([trip(), trip()])).toBeNull();
    expect(find([trip(), trip(), trip()])).toEqual({ name: 'Werkstrasse', at: [8.1, 47] });
    expect(find([trip(), trip(), trip()], [8.5, 47])).toBeNull();
  });

  it('depends on the time and the kind of day', () => {
    const evening = trip({ startedAt: new Date(2026, 10, 16, 18, 0).getTime() });
    const sunday = trip({ startedAt: new Date(2026, 10, 22, 7, 30).getTime() });
    expect(find([evening, evening, evening])).toBeNull();
    expect(find([sunday, sunday, sunday])).toBeNull();
  });

  it('does not guess between two places, or offer the doorstep', () => {
    const other = trip({ end: [8.2, 47], to: 'Anderswo' });
    expect(find([trip(), trip(), trip(), other, other, other])).toBeNull();
    const near = trip({ end: [8.001, 47] });
    expect(find([near, near, near])).toBeNull();
  });

  it('skips drives without a place', () => {
    const bare = trip({ end: null });
    expect(find([bare, bare, bare])).toBeNull();
  });
});

describe('isYes', () => {
  it('takes only a clear yes', () => {
    for (const text of ['Ja', 'ja bitte', 'Klar, mach das', 'Yes please']) {
      expect(isYes(text)).toBe(true);
    }
    for (const text of ['', 'Nein', 'Ja, lieber nicht', 'Vielleicht', 'Jahr']) {
      expect(isYes(text)).toBe(false);
    }
  });
});
