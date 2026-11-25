const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * Whether a place is open, from an OpenStreetMap `opening_hours` value. Only
 * the usual forms are understood; null means unknown.
 */
export function isOpen(hours: string, at: Date): boolean | null {
  const text = hours.trim();
  if (!text) return null;
  if (text === '24/7') return true;
  const minute = at.getHours() * 60 + at.getMinutes();
  const today = openSpans(text, at.getDay());
  const yesterday = openSpans(text, (at.getDay() + 6) % 7);
  if (!today || !yesterday) return null;
  return (
    today.some(([from, to]) => minute >= from && minute < to) ||
    // open past midnight
    yesterday.some(([, to]) => minute + 1440 < to)
  );
}

/** Opening times of a weekday in minutes; null if the text is not understood. */
function openSpans(text: string, day: number): [number, number][] | null {
  let spans: [number, number][] = [];
  for (const rule of text
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)) {
    const match =
      /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?\s?)*)\s*(.*)$/.exec(rule);
    if (!match) return null;
    const [, days, times] = match;
    if (days.trim() && !matchesDay(days, day)) continue;
    if (/^(off|closed)$/.test(times)) {
      spans = [];
      continue;
    }
    if (times === '24/7' || times === '00:00-24:00') {
      spans = [[0, 1440]];
      continue;
    }
    const parsed = times
      .split(',')
      .map((span) => /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})\+?$/.exec(span.trim()));
    if (parsed.some((m) => !m)) return null;
    spans = parsed.map((m) => {
      const [h1, m1, h2, m2] = (m as RegExpExecArray).slice(1).map(Number);
      const from = h1 * 60 + m1;
      const to = h2 * 60 + m2;
      return [from, to <= from ? to + 1440 : to];
    });
  }
  return spans;
}

function matchesDay(days: string, day: number): boolean {
  return days.split(',').some((part) => {
    const [from, to] = part
      .trim()
      .split('-')
      .map((name) => DAYS.indexOf(name));
    if (from < 0) return false; // public holidays are not known
    if (to === undefined) return from === day;
    return from <= to ? day >= from && day <= to : day >= from || day <= to;
  });
}
