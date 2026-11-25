import {
  NO_MEMORY,
  factsFor,
  parseFacts,
  readMemory,
  topicWeight,
  withFacts,
  withReaction,
  withUsed,
  withoutFact,
} from './memory';

const fact = (text: string, ...words: string[]) => ({ text, words });

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
