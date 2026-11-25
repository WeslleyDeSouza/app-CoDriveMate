import { LonLat } from './conversation';

/** A monologue only tells; a dialogue asks and listens. */
export type TalkStyle = 'monologue' | 'dialogue';

/** What a chat can be about, so that it does not always begin the same way. */
export const TOPICS = {
  region: 'something about the region or the places nearby',
  drive: 'this drive so far, the time of day or the road, like a friend on the passenger seat',
  everyday: 'an everyday thing people think about: food, weekend, work, weather, music, films',
  story: 'a short true or clearly invented story with a surprising end',
  curiosity: 'a surprising fact from science, history or nature',
  car: 'the car, driving or the history of motoring, with affection',
  humour: 'a light, kind joke or a funny observation',
  legend: 'a local legend, an odd custom or a curious record from Switzerland or the region',
  past: 'how people lived and travelled in former times',
  dilemma: 'a funny "would you rather", with a choice of your own and a reason for it',
  riddle: 'a short riddle and its surprising solution',
  thought: 'a small thought experiment or a question without a right answer',
} as const;
export type Topic = keyof typeof TOPICS;

/** By chance; topics of more weight come up more often. */
export function pickTopic(
  recent: readonly Topic[],
  random: () => number,
  weight: (topic: Topic) => number = () => 1,
): Topic {
  const all = Object.keys(TOPICS) as Topic[];
  const open = all.filter((topic) => !recent.includes(topic));
  const choice = open.length ? open : all;
  let left = random() * choice.reduce((sum, topic) => sum + weight(topic), 0);
  return choice.find((topic) => (left -= weight(topic)) < 0) ?? choice[choice.length - 1];
}

/** How a chat is opened. */
export function opening(style: TalkStyle, topic: Topic, first: boolean): string {
  const start = first ? 'Begin' : 'The driver said nothing. Go on without pressure';
  return style === 'monologue'
    ? `${start}: tell something about ${TOPICS[topic]}. Only tell, do not ask anything.`
    : `${start} with a short thought or question about ${TOPICS[topic]}.`;
}

/** The drive going on, as far as remarks need it. */
export interface RideFacts {
  readonly rangeKm: number | null;
  readonly coolantC: number | null;
  readonly rpm: number;
  readonly minutes: number;
  readonly km: number;
  readonly hardBrakings: number;
  readonly hardAccelerations: number;
  readonly highRpmSeconds: number;
  readonly idleSeconds: number;
}

export type Remark =
  'tank' | 'pause' | 'cold' | 'braking' | 'accelerating' | 'revs' | 'idling' | 'smooth';

const LOW_RANGE_KM = 80;
const COLD_ENGINE_C = 60;
const PAUSE_MIN = 120;

/** Most important first. What brakes hard wears the pads; where it happened is not known. */
const REMARKS: readonly (readonly [Remark, (ride: RideFacts) => boolean])[] = [
  ['tank', ({ rangeKm }) => rangeKm !== null && rangeKm < LOW_RANGE_KM],
  ['pause', ({ minutes }) => minutes >= PAUSE_MIN],
  ['cold', ({ coolantC, rpm }) => coolantC !== null && coolantC < COLD_ENGINE_C && rpm > 3000],
  ['braking', ({ hardBrakings }) => hardBrakings >= 3],
  ['accelerating', ({ hardAccelerations }) => hardAccelerations >= 3],
  ['revs', ({ highRpmSeconds }) => highRpmSeconds >= 60],
  ['idling', ({ idleSeconds }) => idleSeconds >= 180],
  [
    'smooth',
    ({ km, hardBrakings, hardAccelerations }) => km >= 10 && hardBrakings + hardAccelerations === 0,
  ],
];

/** The next remark about the drive; each is made once per drive. */
export function pickRemark(ride: RideFacts, made: ReadonlySet<Remark>): Remark | null {
  return REMARKS.find(([remark, applies]) => !made.has(remark) && applies(ride))?.[0] ?? null;
}

/** The current drive in words for the language model: figures only, no places. */
export function rideText({ km, minutes, hardBrakings, hardAccelerations }: RideFacts): string {
  return (
    `${Math.round(km)} km in ${Math.round(minutes)} min, ` +
    `hard brakings: ${hardBrakings}, hard accelerations: ${hardAccelerations}`
  );
}

export interface PastTrip {
  readonly startedAt: number;
  readonly from: LonLat | null;
  readonly end: LonLat | null;
  readonly to: string;
}

export interface UsualDestination {
  readonly name: string;
  readonly at: LonLat;
}

const SAME_PLACE_M = 300;
const SAME_TIME_MIN = 90;
const MIN_TRIPS = 3;
/** Nothing to offer on the doorstep. */
const MIN_AWAY_M = 1000;

const isWeekend = (time: Date) => time.getDay() === 0 || time.getDay() === 6;

function timeApartMin(a: Date, b: Date): number {
  const apart = Math.abs(a.getHours() * 60 + a.getMinutes() - b.getHours() * 60 - b.getMinutes());
  return Math.min(apart, 24 * 60 - apart);
}

/** Where the driver usually goes from here at this time. Worked out on the device only. */
export function usualDestination(
  trips: readonly PastTrip[],
  start: LonLat,
  now: number,
  distanceM: (a: LonLat, b: LonLat) => number,
): UsualDestination | null {
  const time = new Date(now);
  const groups: { at: LonLat; name: string; newest: number; count: number }[] = [];
  for (const { startedAt, from, end, to } of trips) {
    const then = new Date(startedAt);
    if (!from || !end || !to || distanceM(from, start) > SAME_PLACE_M) continue;
    if (distanceM(end, start) < MIN_AWAY_M) continue;
    if (isWeekend(then) !== isWeekend(time) || timeApartMin(then, time) > SAME_TIME_MIN) continue;
    const group = groups.find(({ at }) => distanceM(at, end) <= SAME_PLACE_M);
    if (!group) groups.push({ at: end, name: to, newest: startedAt, count: 1 });
    else {
      group.count++;
      if (startedAt > group.newest) Object.assign(group, { name: to, newest: startedAt });
    }
  }
  const [best, second] = groups.sort((a, b) => b.count - a.count);
  // Two equally usual places would be a guess.
  if (!best || best.count < MIN_TRIPS || best.count === second?.count) return null;
  return { name: best.name, at: best.at };
}

const NO = /(^|[^\p{L}])(nein|nee|nicht|no|nope|don't|not)($|[^\p{L}])/iu;
const YES =
  /(^|[^\p{L}])(ja|jo|klar|gern|gerne|sicher|okay|ok|bitte|mach|yes|yeah|sure|please)($|[^\p{L}])/iu;

/** A clear yes; anything doubtful is none. */
export function isYes(text: string): boolean {
  return YES.test(text) && !NO.test(text);
}
