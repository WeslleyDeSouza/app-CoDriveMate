export type TalkMode = 'ride' | 'chat' | 'facts' | 'quiz';
export const TALK_MODES: readonly TalkMode[] = ['ride', 'chat', 'facts', 'quiz'];
/** These work without a language model. */
export const KEYLESS_MODES: readonly TalkMode[] = ['ride', 'facts'];

const LOW_RANGE_KM = 80;
const COLD_ENGINE_C = 60;

/** What about the car is worth a remark; '' if nothing. */
export function carRemark(
  rangeKm: number | null,
  coolantC: number | null,
  speedKmh: number,
  connected: boolean,
): string {
  if (!connected) return '';
  const remarks: string[] = [];
  if (rangeKm !== null && rangeKm < LOW_RANGE_KM) {
    remarks.push(`tank almost empty, about ${Math.round(rangeKm)} km left`);
  }
  if (coolantC !== null && coolantC < COLD_ENGINE_C) remarks.push('engine still cold');
  if (speedKmh < 2) remarks.push('standing still');
  return remarks.join(', ');
}

/** The next thing to do: by chance, but not the same twice in a row. */
export function pickMode(
  modes: readonly TalkMode[],
  last: TalkMode | null,
  random: () => number,
): TalkMode | null {
  const others = modes.filter((mode) => mode !== last);
  const choice = others.length ? others : modes;
  return choice[Math.min(choice.length - 1, Math.floor(random() * choice.length))] ?? null;
}

export type LonLat = readonly [lon: number, lat: number];

export interface Landmark {
  readonly id: number;
  readonly title: string;
  readonly at: LonLat;
}

/** Port: noteworthy places, from Wikipedia. */
export abstract class LandmarkSource {
  abstract near(at: LonLat, lang: string): Promise<Landmark[]>;
  /** First sentences about a place, '' if there are none. */
  abstract extract(id: number, lang: string): Promise<string>;
}

/** Port: which places were already told. */
export abstract class TalkRepository {
  abstract loadSeen(): Promise<readonly number[]>;
  abstract saveSeen(ids: readonly number[]): Promise<void>;
}

/** No talking this close to a manoeuvre. */
export const QUIET_BEFORE_MANEUVER_M = 700;

export interface TalkConditions {
  /** metres to the next manoeuvre, null without a route */
  readonly maneuverM: number | null;
  readonly speaking: boolean;
  readonly visible: boolean;
  /** vehicle warning or hazard notice on screen */
  readonly warning: boolean;
}

export function mayTalk({ maneuverM, speaking, visible, warning }: TalkConditions): boolean {
  const close = maneuverM !== null && maneuverM < QUIET_BEFORE_MANEUVER_M;
  return visible && !speaking && !warning && !close;
}

const STOP =
  /(^|[^\p{L}])(stopp?|ruhe|aufhören|genug|schluss|sei still|stop it|quiet|enough|shut up)($|[^\p{L}])/iu;

/** The driver wants silence. */
export function isStop(text: string): boolean {
  return STOP.test(text);
}

export type Direction = 'near' | 'ahead' | 'right' | 'left' | 'behind';

/** Where something is, seen from the driver. */
export function directionTo(bearing: number, heading: number, speedKmh: number): Direction {
  if (speedKmh < 5) return 'near';
  const turn = ((((bearing - heading) % 360) + 540) % 360) - 180;
  if (Math.abs(turn) < 30) return 'ahead';
  if (Math.abs(turn) >= 120) return 'behind';
  return turn > 0 ? 'right' : 'left';
}

export interface LandmarkAround extends Landmark {
  readonly distanceM: number;
  readonly direction: Direction;
}

const TOO_CLOSE_M = 150;

/** The next place worth telling about: unknown, and rather ahead than passed. */
export function pickLandmark(
  places: readonly LandmarkAround[],
  seen: ReadonlySet<number>,
): LandmarkAround | null {
  const rank = ({ direction }: LandmarkAround) =>
    direction === 'ahead' ? 0 : direction === 'behind' ? 2 : 1;
  const open = places.filter(({ id, distanceM }) => !seen.has(id) && distanceM > TOO_CLOSE_M);
  return [...open].sort((a, b) => rank(a) - rank(b) || a.distanceM - b.distanceM)[0] ?? null;
}

/** First sentences of a text, for when no language model shortens it. */
export function firstSentences(text: string, count: number, maxLength: number): string {
  const sentences = text.split(/(?<=[.!?])\s+(?=\p{Lu})/u).slice(0, count);
  let result = '';
  for (const sentence of sentences) {
    if (result && result.length + sentence.length > maxLength) break;
    result += (result ? ' ' : '') + sentence;
  }
  return result.length > maxLength
    ? result.slice(0, maxLength).replace(/\s+\S*$/, '') + '…'
    : result;
}

export type QuizKey = 'a' | 'b' | 'c';
export const QUIZ_KEYS: readonly QuizKey[] = ['a', 'b', 'c'];

export interface QuizQuestion {
  readonly question: string;
  readonly a: string;
  readonly b: string;
  readonly c: string;
  readonly correct: QuizKey;
  readonly explanation: string;
}

export const QUIZ_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    a: { type: 'string' },
    b: { type: 'string' },
    c: { type: 'string' },
    correct: { type: 'string', enum: ['a', 'b', 'c'] },
    explanation: { type: 'string', description: 'one short sentence' },
  },
  required: ['question', 'a', 'b', 'c', 'correct', 'explanation'],
  additionalProperties: false,
};

/** Null if the answer is not a usable question. */
export function parseQuiz(raw: string): QuizQuestion | null {
  try {
    const quiz = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as QuizQuestion;
    const texts = [quiz.question, quiz.a, quiz.b, quiz.c];
    const usable = texts.every((text) => typeof text === 'string' && text.trim());
    return usable && QUIZ_KEYS.includes(quiz.correct)
      ? { ...quiz, explanation: String(quiz.explanation ?? '') }
      : null;
  } catch {
    return null;
  }
}

const SOUNDS: Record<string, QuizKey> = {
  a: 'a',
  ah: 'a',
  b: 'b',
  be: 'b',
  bee: 'b',
  c: 'c',
  ce: 'c',
  zeh: 'c',
  see: 'c',
};

/** Which answer was meant: by letter or by its text. */
export function quizAnswer(heard: string, quiz: QuizQuestion): QuizKey | null {
  const text = heard.toLowerCase().trim();
  if (!text) return null;
  const said = QUIZ_KEYS.find((key) => {
    const answer = quiz[key].toLowerCase().trim();
    return text === answer || (answer.length > 2 && text.includes(answer));
  });
  if (said) return said;
  const words = text.split(/[^\p{L}]+/u).filter(Boolean);
  // A single letter, or the last one after "answer" or "I think".
  const letter = [...words].reverse().find((word) => word in SOUNDS);
  return letter ? SOUNDS[letter] : null;
}
