import { isRelevant, normalized, searchVariants } from './search-text';

describe('search text', () => {
  it('drops words from the end when the whole text finds nothing', () => {
    expect(searchVariants('Lionsoul Zürich 24H Fitness')).toEqual([
      'Lionsoul Zürich 24H Fitness',
      'Lionsoul Zürich 24H',
      'Lionsoul Zürich',
    ]);
    expect(searchVariants('  Hürlimannbad   Zürich ')).toEqual([
      'Hürlimannbad Zürich',
      'Hürlimannbad',
    ]);
    expect(searchVariants('Bern')).toEqual(['Bern']);
  });

  it('does not search for one short word alone', () => {
    expect(searchVariants('Zoo Zürich')).toEqual(['Zoo Zürich']);
  });

  it('ignores case, accents and umlauts', () => {
    expect(normalized('Hürlimann Straße Café')).toBe('hurlimann strasse cafe');
    expect(normalized('Zuerich')).toBe(normalized('Zürich'));
  });

  it('keeps guesses that share a word in the name or street, not just the town', () => {
    const text = 'Hürlimannbad Zürich';
    expect(isRelevant({ name: 'Zue Rich Barber Club', street: 'Hardstrasse 3' }, text)).toBe(false);
    expect(isRelevant({ name: 'Richterswil', street: '' }, text)).toBe(false);
    expect(isRelevant({ name: 'Hürlimann-Areal', street: '' }, text)).toBe(true);
    expect(isRelevant({ name: 'Zürich', street: '' }, 'Zuerich')).toBe(true);
    expect(isRelevant({ name: 'Lionsoul Zürich', street: '' }, 'Lionsol')).toBe(true);
    expect(isRelevant({ name: 'Bahnhof', street: 'Hardgutstrasse 16' }, 'hardgut 16')).toBe(true);
  });
});
