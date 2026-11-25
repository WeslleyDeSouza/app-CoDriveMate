/** Fault codes with a description in the translations. */
export const KNOWN_CODES: readonly string[] = [
  'P0100',
  'P0105',
  'P0110',
  'P0115',
  'P0120',
  'P0130',
  'P0133',
  'P0135',
  'P0141',
  'P0171',
  'P0172',
  'P0300',
  'P0301',
  'P0302',
  'P0303',
  'P0304',
  'P0325',
  'P0335',
  'P0340',
  'P0420',
  'P0443',
  'P0500',
  'P0505',
  'P0560',
];

const lines = (raw: string) =>
  raw
    .split(/[\r\n]+/)
    .map((line) => line.replace(/\s/g, '').toUpperCase())
    .filter(Boolean);

/** Whether the engine warning lamp is on, from the answer to 0101; null = unknown. */
export function parseLamp(raw: string): boolean | null {
  const line = lines(raw).find((text) => text.startsWith('4101') && text.length >= 6);
  const first = line ? parseInt(line.slice(4, 6), 16) : NaN;
  return Number.isNaN(first) ? null : (first & 128) !== 0;
}

/** Stored codes from the answer to 03; null if the car did not answer. */
export function parseCodes(raw: string): string[] | null {
  const answers = lines(raw).filter((text) => text.startsWith('43'));
  if (!answers.length) return /NODATA/.test(lines(raw).join('')) ? [] : null;
  const codes = new Set<string>();
  for (const answer of answers) {
    let data = answer.slice(2);
    // CAN puts the number of codes in front.
    if (data.length % 4 === 2) data = data.slice(2);
    for (let i = 0; i + 4 <= data.length; i += 4) {
      const code = data.slice(i, i + 4);
      if (/^[0-9A-F]{4}$/.test(code) && code !== '0000') codes.add(decode(code));
    }
  }
  return [...codes];
}

/** Whether the answer to 04 confirms that the codes were cleared. */
export function parseCleared(raw: string): boolean {
  return lines(raw).some((text) => text.startsWith('44'));
}

function decode(hex: string): string {
  const first = parseInt(hex[0], 16);
  return 'PCBU'[first >> 2] + (first & 3) + hex.slice(1);
}
