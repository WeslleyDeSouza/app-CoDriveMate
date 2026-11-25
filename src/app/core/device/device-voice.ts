/** Locale of the voices per app language. */
export const VOICE_LOCALES: Record<string, string> = { de: 'de-DE', en: 'en-GB' };

export interface DeviceVoice {
  readonly lang: string;
  readonly voiceURI: string;
}

/** iOS names the quality in the identifier of a voice; downloaded ones sound natural. */
function quality(uri: string): number {
  if (/\.premium\./i.test(uri)) return 4;
  if (/\.enhanced\./i.test(uri)) return 3;
  if (/\.super-compact\./i.test(uri)) return 1;
  // Eloquence and the novelty voices are the mechanical ones.
  if (/eloquence|speech\.synthesis\.voice/i.test(uri)) return 0;
  return 2;
}

/** Index of the best iOS voice for the locale, -1 if the default has to do. */
export function bestVoice(voices: readonly DeviceVoice[], locale: string): number {
  const language = locale.split('-')[0];
  let best = -1;
  let bestScore = 0;
  voices.forEach(({ lang, voiceURI }, index) => {
    const grade = quality(voiceURI);
    if (!grade || lang.split('-')[0] !== language) return;
    const score = grade * 2 + (lang === locale ? 1 : 0);
    if (score > bestScore) [best, bestScore] = [index, score];
  });
  return best;
}
