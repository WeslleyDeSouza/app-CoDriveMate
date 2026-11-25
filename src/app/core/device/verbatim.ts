/** A wrong one of these sends the driver the wrong way. */
const DIRECTIONS = new Set(['links', 'rechts', 'geradeaus', 'wenden', 'left', 'right', 'straight']);
/** Share of the words that must come in the same order. */
const MIN_MATCH = 0.85;
/** Words more than the text has; a spelled-out number takes several. */
const EXTRA_WORDS = 2;
const WORDS_PER_NUMBER = 4;

function words(text: string): string[] {
  return (
    (
      text
        .toLowerCase()
        .replaceAll('ß', 'ss')
        // 1'200 and 1.5 are one number each
        .replace(/(\d)['’](?=\d)/g, '$1')
        .match(/\d+(?:[.,]\d+)?|\p{L}+/gu) ?? []
    ).map((word) => word.replace(',', '.'))
  );
}

const isNumber = (word: string) => /^\d/.test(word);

/** Length of the longest common subsequence. */
function common(a: readonly string[], b: readonly string[]): number {
  let row = new Array<number>(b.length + 1).fill(0);
  for (const word of a) {
    const next = [0];
    b.forEach((other, i) => {
      next.push(word === other ? row[i] + 1 : Math.max(row[i + 1], next[i]));
    });
    row = next;
  }
  return row[b.length];
}

/**
 * Whether a transcript is the text read aloud. Numbers may be spelled out, but
 * must not be others; directions must be exactly the same.
 */
export function saysTheSame(text: string, transcript: string): boolean {
  const wanted = words(text);
  const said = words(transcript);
  if (!wanted.length || !said.length) return false;
  const numbers = wanted.filter(isNumber);
  const saidNumbers = said.filter(isNumber);
  if (common(numbers, saidNumbers) !== saidNumbers.length) return false;
  const directions = (list: readonly string[]) =>
    list.filter((word) => DIRECTIONS.has(word)).join(' ');
  if (directions(wanted) !== directions(said)) return false;
  const plain = wanted.filter((word) => !isNumber(word));
  const saidPlain = said.filter((word) => !isNumber(word));
  const spelled = (numbers.length - saidNumbers.length) * WORDS_PER_NUMBER;
  if (saidPlain.length > plain.length + spelled + EXTRA_WORDS) return false;
  return common(plain, saidPlain) >= plain.length * MIN_MATCH;
}
