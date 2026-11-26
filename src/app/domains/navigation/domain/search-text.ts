/** Free OSM searches want every word in the name; this many shorter tries follow. */
const MAX_SHORTER = 2;
const MIN_WORD = 3;
/** Words this long that start alike count as the same, despite a typo further on. */
const SAME_START = 4;

/** Lower case, without accents, umlauts (also written ae, oe, ue) as their base letter. */
export function normalized(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      // "Zuerich" is typed for "Zürich"; done on both sides, so nothing else breaks.
      .replace(/([aou])e/g, '$1')
  );
}

function words(text: string): string[] {
  return normalized(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * What to search for, in order: the whole text, then with words dropped from the end,
 * because words like "24h Fitness" behind a name make a free search find nothing.
 */
export function searchVariants(text: string): string[] {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  const variants = [parts.join(' ')];
  for (let n = parts.length - 1; n >= 1 && variants.length <= MAX_SHORTER; n--) {
    const shorter = parts.slice(0, n).join(' ');
    // A single short word finds anything.
    if (n === 1 && normalized(shorter).length < SAME_START) break;
    variants.push(shorter);
  }
  return variants.filter(Boolean);
}

function sameWord(asked: string, found: string): boolean {
  if (found.startsWith(asked) || (found.length >= MIN_WORD && asked.startsWith(found))) {
    return true;
  }
  return (
    asked.length >= SAME_START &&
    found.length >= SAME_START &&
    asked.slice(0, SAME_START) === found.slice(0, SAME_START)
  );
}

/**
 * A guess of a fuzzy search is kept only if a word of the text is in its name or street;
 * the town alone does not count, or "Zürich" would bring any shop in Zürich.
 */
export function isRelevant(
  { name, street }: { name: string; street: string },
  text: string,
): boolean {
  const asked = words(text).filter((word) => word.length >= MIN_WORD);
  if (!asked.length) return true;
  const found = [...words(name), ...words(street)];
  return asked.some((word) => found.some((other) => sameWord(word, other)));
}
