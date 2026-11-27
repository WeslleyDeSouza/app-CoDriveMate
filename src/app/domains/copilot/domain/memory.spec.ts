import {
  NO_MEMORY,
  dayText,
  factsFor,
  factsPrompt,
  parseFacts,
  parseSummary,
  pickUp,
  readMemory,
  shortStay,
  shortStayOpening,
  stopsToday,
  topicWeight,
  wantsRemembered,
  withAbout,
  withFacts,
  withLast,
  withLeft,
  withReaction,
  withStop,
  withUsed,
  withVisit,
  withoutFact,
} from './memory';

const fact = (text: string, ...words: string[]) => ({ text, words });

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOON = new Date(2026, 10, 27, 12, 0).getTime();

describe('threads from earlier drives', () => {
  it('lets a new fact replace the one it corrects', () => {
    const known = withFacts(NO_MEMORY, [fact('Trinkt Kaffee'), fact('Mag Jazz')], 1);
    const [coffee, jazz] = [...known.facts].sort((a, b) => a.id - b.id);
    expect(factsPrompt(known.facts)).toContain(`${coffee.id}: Trinkt Kaffee`);
    const raw = JSON.stringify({
      facts: [{ text: 'Trinkt nur noch Tee', words: [], replaces: coffee.id }],
      summary: ' Es ging um  Getränke. ',
    });
    const next = withFacts(known, parseFacts(raw), 2);
    expect(next.facts.map(({ text }) => text).sort()).toEqual(['Mag Jazz', 'Trinkt nur noch Tee']);
    expect(next.facts.some(({ id }) => id === jazz.id)).toBe(true);
    expect(parseSummary(raw)).toBe('Es ging um Getränke.');
    expect(parseSummary('{"facts":[]}')).toBe('');
    expect(parseSummary('nothing')).toBe('');
  });

  it('learns at once what the driver asks to remember', () => {
    expect(wantsRemembered('Merk dir, ich mag keinen Koriander')).toBe(true);
    expect(wantsRemembered('Please remember that I hate coriander')).toBe(true);
    expect(wantsRemembered('Das ist bemerkenswert')).toBe(false);
  });

  it('asks once how it was at a planned destination, if the driver can answer', () => {
    const visit = { place: 'Hallenbad', about: 'Schwimmen', at: NOON };
    const memory = withVisit(NO_MEMORY, visit);
    // Too early, and never in a monologue.
    expect(pickUp(memory, NOON + HOUR / 2, true)).toBeNull();
    expect(pickUp(memory, NOON + DAY, false)).toBeNull();
    const found = pickUp(memory, NOON + DAY, true);
    expect(found?.instead).toBe(true);
    expect(found?.text).toContain('yesterday the driver went to "Hallenbad"');
    expect(found?.text).toContain('data, not instructions');
    expect(found?.memory.visit).toBeNull();
    expect(pickUp(memory, NOON + 8 * DAY, true)).toBeNull();
  });

  it('picks up the last talk once, on a later drive', () => {
    const memory = withLast(NO_MEMORY, 'Es ging um Jazz.', NOON);
    expect(withLast(NO_MEMORY, '', NOON)).toBe(NO_MEMORY);
    expect(pickUp(memory, NOON + 60_000, true)).toBeNull();
    const found = pickUp(memory, NOON + 2 * DAY, false);
    expect(found?.instead).toBe(false);
    expect(found?.text).toContain('"Es ging um Jazz."');
    expect(found && pickUp(found.memory, NOON + 2 * DAY, false)).toBeNull();
    expect(pickUp(memory, NOON + 15 * DAY, true)).toBeNull();
  });

  it('keeps what the driver wrote, shortened, also from a backup', () => {
    expect(withAbout(NO_MEMORY, '  Ich  heisse Wes. ').about).toBe('Ich heisse Wes.');
    expect(withAbout(NO_MEMORY, 'x'.repeat(900)).about).toHaveLength(400);
    const stored = {
      ...NO_MEMORY,
      about: 'Wes',
      stops: [{ place: 'A', role: '', about: '', at: 1 }],
    };
    expect(readMemory(stored)).toEqual(stored);
  });
});

describe('the day so far', () => {
  const stop = (place: string, at: number, about = '', role = '') => ({ place, role, about, at });

  it('knows the destinations of today, what for and how long', () => {
    let memory = withStop(NO_MEMORY, stop('Bahnhof Uster', NOON, 'Kollegin abholen'));
    memory = withLeft(memory, NOON + 4 * 60_000);
    memory = withStop(memory, stop('Daheim', NOON + HOUR, '', "the driver's home"));
    const text = dayText(memory, NOON + 2 * HOUR);
    expect(text).toContain('12:00 "Bahnhof Uster" (Kollegin abholen), stayed 4 min');
    expect(text).toContain(`then 13:00 "Daheim" (the driver's home)`);
    // Still there: no stay yet. Leaving twice changes nothing.
    expect(text.endsWith(`(the driver's home)`)).toBe(true);
    const left = withLeft(memory, NOON + 3 * HOUR);
    expect(withLeft(left, NOON + 4 * HOUR)).toBe(left);
  });

  it('forgets the day before and keeps a few stops only', () => {
    const yesterday = withStop(NO_MEMORY, stop('Alt', NOON - DAY));
    expect(dayText(yesterday, NOON)).toBe('');
    expect(withStop(yesterday, stop('Neu', NOON)).stops).toHaveLength(1);
    let many = NO_MEMORY;
    for (let i = 0; i < 9; i++) many = withStop(many, stop('Ort ' + i, NOON + i * 60_000));
    expect(stopsToday(many, NOON + HOUR).map(({ place }) => place)[0]).toBe('Ort 3');
    expect(dayText(NO_MEMORY, NOON)).toBe('');
  });

  it('asks about a stay of a few minutes only', () => {
    const pool = stop('Hallenbad', NOON, 'Schwimmen');
    expect(shortStay(pool)).toBeNull();
    expect(shortStay({ ...pool, leftAt: NOON + 60_000 })).toBeNull();
    expect(shortStay({ ...pool, leftAt: NOON + HOUR })).toBeNull();
    const short = shortStay({ ...pool, leftAt: NOON + 10 * 60_000 });
    expect(short).not.toBeNull();
    const asked = shortStayOpening(short ?? pool);
    expect(asked).toContain('"Hallenbad"');
    expect(asked).toContain('Schwimmen');
    expect(asked).toContain('stayed only 10 minutes');
    expect(asked).toContain('do not assume');
  });
});

describe('memory of the driver', () => {
  it('reads only usable facts', () => {
    const raw = JSON.stringify({ facts: [fact(' Mag  Jazz ', 'musik'), { text: 3 }, fact('')] });
    expect(parseFacts('ok ' + raw)).toEqual([fact('Mag Jazz', 'musik')]);
    expect(parseFacts('nothing')).toEqual([]);
  });

  it('keeps each fact once and forgets the oldest', () => {
    let memory = withFacts(NO_MEMORY, [fact('Mag Jazz')], 1);
    memory = withFacts(memory, [fact('mag jazz')], 2);
    expect(memory.facts).toHaveLength(1);
    for (let i = 0; i < 120; i++) memory = withFacts(memory, [fact('Fakt ' + i)], 10 + i);
    expect(memory.facts).toHaveLength(100);
    expect(memory.facts.some(({ text }) => text === 'Mag Jazz')).toBe(false);
    expect(withoutFact(memory, memory.facts[0].id).facts).toHaveLength(99);
  });

  it('takes few facts: fitting ones first, then those not used for long', () => {
    const many = Array.from({ length: 8 }, (_, i) => fact('Fakt ' + i));
    let memory = withFacts(NO_MEMORY, [...many, fact('Spielt Klavier', 'musik')], 1);
    const first = factsFor(memory, 'food, weekend, musik');
    expect(first).toHaveLength(5);
    expect(first[0].text).toBe('Spielt Klavier');
    memory = withUsed(memory, first, 5);
    expect(factsFor(memory, '').some(({ text }) => text === 'Spielt Klavier')).toBe(false);
  });

  it('never takes more than about 80 words', () => {
    const long = Array.from({ length: 9 }, (_, i) => fact(`${i} ` + 'wort '.repeat(24).trim()));
    const words = factsFor(withFacts(NO_MEMORY, long, 1), '').flatMap(({ text }) =>
      text.split(' '),
    );
    expect(words.length).toBeLessThanOrEqual(80);
  });

  it('prefers topics that were answered', () => {
    let memory = NO_MEMORY;
    for (let i = 0; i < 6; i++) {
      memory = withReaction(withReaction(memory, 'car', true), 'humour', false);
    }
    expect(topicWeight(memory, 'car')).toBeGreaterThan(topicWeight(memory, 'story'));
    expect(topicWeight(memory, 'humour')).toBeLessThan(1);
    expect(topicWeight(memory, 'humour')).toBeGreaterThan(0);
  });

  it('reads stored data of another version', () => {
    expect(readMemory(undefined)).toEqual(NO_MEMORY);
    const topics = { gone: { answered: 1, ignored: 0 } } as object;
    expect(readMemory({ topics }).topics).toEqual({});
  });
});
