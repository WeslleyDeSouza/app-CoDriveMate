import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { ListeningUnavailableError, SpeechInput, SpeechOutput } from '@core/device';
import { TranslateService } from '@core/i18n';
import { UnitsStore } from '@core/units';
import { WarningStore } from '@domains/diagnostics';
import { FuelStore } from '@domains/fuel';
import { NavigationStore, PositionStore, bearing, distanceM } from '@domains/navigation';
import { RoadStore } from '@domains/road';
import { SceneStore } from '@domains/scene3d';
import { SettingsStore } from '@domains/settings';
import { TelemetryStore } from '@domains/telemetry';
import { formatDistanceIn } from '@shared/kernel/units';
import {
  LandmarkAround,
  LandmarkSource,
  Landmark,
  LonLat,
  QUIZ_KEYS,
  QUIZ_SCHEMA,
  QuizKey,
  QuizQuestion,
  TALK_MODES,
  TalkMode,
  TalkRepository,
  carRemark,
  directionTo,
  firstSentences,
  isStop,
  mayTalk,
  parseQuiz,
  pickLandmark,
  pickMode,
  quizAnswer,
} from '../domain/conversation';
import { ChatError, ChatMessage, ChatModel, MAX_HISTORY, passengerPrompt } from '../domain/copilot';
import { CopilotStore } from './copilot.store';

const TICK_MS = 1000;
const START_MS = 1500;
const LISTEN_MS = 8000;
const RETRY_MS = 4000;
const FAILED_MS = 60_000;
const NOTHING_NEAR_MS = 120_000;
const CHAT_PAUSE_MS = 120_000;
const QUIZ_PAUSE_MS = 45_000;
const MAX_TURNS = 6;
const LANDMARKS_VALID_M = 3000;
const MAX_SEEN = 500;

export type TalkNotice = 'needs_key' | 'failed' | 'no_microphone' | 'no_position' | 'key_rejected';

/** Chatting, facts about the way and a quiz. Anything else that speaks interrupts it. */
@Injectable({ providedIn: 'root' })
export class ConversationStore {
  private readonly model = inject(ChatModel);
  private readonly copilot = inject(CopilotStore);
  private readonly landmarks = inject(LandmarkSource);
  private readonly repository = inject(TalkRepository);
  private readonly output = inject(SpeechOutput);
  private readonly input = inject(SpeechInput);
  private readonly positions = inject(PositionStore);
  private readonly navigation = inject(NavigationStore);
  private readonly telemetry = inject(TelemetryStore);
  private readonly scene = inject(SceneStore);
  private readonly fuel = inject(FuelStore);
  private readonly warnings = inject(WarningStore);
  private readonly road = inject(RoadStore);
  private readonly settings = inject(SettingsStore).settings;
  private readonly units = inject(UnitsStore).units;
  private readonly translate = inject(TranslateService);

  private readonly _modes = signal<readonly TalkMode[]>([]);
  private readonly _current = signal<TalkMode | null>(null);
  private readonly _listening = signal(false);
  private readonly _quiz = signal<QuizQuestion | null>(null);
  private readonly _score = signal({ right: 0, asked: 0 });
  private readonly _notice = signal<TalkNotice | null>(null);

  /** What the driver switched on; with several, they take turns by chance. */
  readonly modes = this._modes.asReadonly();
  readonly active = computed(() => this._modes().length > 0);
  readonly mixed = computed(() => this._modes().length > 1);
  /** What is going on right now. */
  readonly current = this._current.asReadonly();
  readonly listening = this._listening.asReadonly();
  /** The open question. */
  readonly quiz = this._quiz.asReadonly();
  readonly score = this._score.asReadonly();
  readonly notice = this._notice.asReadonly();

  /** Raised with every start and stop: older steps end by themselves. */
  private session = 0;
  private last: TalkMode | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private nextAt = 0;
  private working = false;
  private history: ChatMessage[] = [];
  private asked: string[] = [];
  private picked: QuizKey | null = null;
  private deaf = false;
  private seen?: Set<number>;
  private around: { at: LonLat; places: Landmark[] } | null = null;

  constructor() {
    // Whoever else speaks must not be listened to.
    effect(() => {
      if (this.output.busy() && untracked(this._listening)) this.input.abort();
    });
  }

  /** Adds a mode, or takes it away again. */
  toggle(mode: TalkMode): void {
    const modes = this._modes();
    if (modes.includes(mode)) this.use(modes.filter((other) => other !== mode));
    else this.use([...modes, mode]);
  }

  /** All modes, or none if all are on already. */
  toggleAll(): void {
    this.use(this._modes().length === this.usable(TALK_MODES).length ? [] : TALK_MODES);
  }

  private use(wanted: readonly TalkMode[]): void {
    const modes = this.usable(wanted);
    const current = this._current();
    const notice = modes.length < wanted.length ? 'needs_key' : null;
    if (!modes.length) {
      this.stop();
      return this._notice.set(notice);
    }
    this._notice.set(notice);
    if (!this._modes().length) {
      this.history = [];
      this.deaf = false;
      this.last = null;
      this.nextAt = Date.now() + START_MS;
      this.timer = setInterval(() => void this.tick(), TICK_MS);
    } else if (current && !modes.includes(current)) {
      this.interrupt();
      this.nextAt = Date.now() + START_MS;
    } else if (!current) {
      // Waiting for a long pause of another mode makes no sense.
      this.nextAt = Math.min(this.nextAt, Date.now() + START_MS);
    }
    this._modes.set(modes);
  }

  private usable(modes: readonly TalkMode[]): readonly TalkMode[] {
    return this.copilot.available() ? modes : modes.filter((mode) => mode === 'facts');
  }

  stop(): void {
    clearInterval(this.timer);
    this._modes.set([]);
    this.interrupt();
  }

  /** Ends what is going on; the modes stay on. */
  private interrupt(): void {
    this.session++;
    this.working = false;
    this._current.set(null);
    this._quiz.set(null);
    this._listening.set(false);
    this.input.abort();
    void this.output.stop('talk');
  }

  /** Answers the open question by touch. */
  pick(key: QuizKey): void {
    if (!this._quiz()) return;
    this.picked = key;
    this.input.abort();
    void this.output.stop('talk');
  }

  private async tick(): Promise<void> {
    if (!this.active() || this.working || Date.now() < this.nextAt) return;
    if (!this.free()) {
      this.nextAt = Date.now() + RETRY_MS;
      return;
    }
    const mode = pickMode(this._modes(), this.last, Math.random);
    if (!mode) return;
    const session = this.session;
    this.last = mode;
    this._current.set(mode);
    this.working = true;
    try {
      await { chat: this.chat, facts: this.facts, quiz: this.ask }[mode].call(this, session);
    } catch (error) {
      if (session !== this.session) return;
      this.nextAt = Date.now() + FAILED_MS;
      const key = error instanceof ChatError && error.reason === 'key';
      this._notice.set(key ? 'key_rejected' : 'failed');
      if (key) this.stop();
      else if (!(error instanceof ChatError)) console.warn('Conversation failed', error);
    } finally {
      if (session === this.session) {
        this.working = false;
        this._current.set(null);
      }
    }
  }

  private async chat(session: number): Promise<void> {
    await this.loadAround().catch(() => undefined);
    const opening = this.history.length
      ? 'The driver said nothing. Briefly tell something new or interesting, without pressure to answer.'
      : 'Begin a casual conversation with a short fitting thought or question.';
    let said = await this.reply(opening, session);
    for (let turn = 0; said && turn < MAX_TURNS; turn++) {
      const spoken = await this.say(said, session);
      // Interrupted by navigation or a warning: do not go on in the middle of it.
      if (!spoken || !this.free()) break;
      const heard = await this.listen(session);
      if (!heard || session !== this.session) break;
      this.copilot.add('user', heard);
      if (isStop(heard)) {
        await this.say(this.t('copilot.talk.quiet'), session);
        if (session === this.session) this.stop();
        return;
      }
      said = await this.reply(heard, session);
    }
    if (session === this.session) this.nextAt = Date.now() + CHAT_PAUSE_MS;
  }

  private async facts(session: number): Promise<void> {
    const { lang } = this.translate;
    if (!this.positions.position()) {
      this._notice.set('no_position');
      this.nextAt = Date.now() + (this.mixed() ? RETRY_MS : FAILED_MS);
      return;
    }
    this.seen ??= new Set(await this.repository.loadSeen().catch(() => []));
    await this.loadAround();
    const place = pickLandmark(this.placesAround(), this.seen);
    if (!place) {
      this.nextAt = Date.now() + (this.mixed() ? RETRY_MS : NOTHING_NEAR_MS);
      return;
    }
    this.seen.add(place.id);
    void this.repository.saveSeen([...this.seen].slice(-MAX_SEEN)).catch(() => undefined);
    const extract = await this.landmarks.extract(place.id, lang);
    if (!extract || session !== this.session) {
      this.nextAt = Date.now() + RETRY_MS;
      return;
    }
    const where = this.t('copilot.talk.where', {
      direction: this.t('copilot.talk.direction.' + place.direction),
      distance: formatDistanceIn(place.distanceM, this.units()),
    });
    const text = this.copilot.available()
      ? await this.model
          .ask({
            system: passengerPrompt(lang),
            messages: [
              {
                role: 'user',
                content:
                  `Tell an interesting fact about "${place.title}" (${where}). ` +
                  `Use only this source from Wikipedia: ${extract.slice(0, 1200)}`,
              },
            ],
          })
          .catch(() => '')
      : '';
    if (session !== this.session) return;
    // Thinking takes time; a manoeuvre may have come close.
    if (this.free()) {
      const plain = `${place.title}, ${where}. ${firstSentences(extract, 2, 280)}`;
      await this.say(text || plain, session);
    }
    if (session === this.session) {
      this.nextAt = Date.now() + (this.telemetry.snapshot().speed > 60 ? 150_000 : 200_000);
    }
  }

  private async ask(session: number): Promise<void> {
    await this.loadAround().catch(() => undefined);
    const near = (this.around?.places ?? []).slice(0, 8).map(({ title }) => title);
    const raw = await this.model.ask({
      system: passengerPrompt(this.translate.lang),
      schema: QUIZ_SCHEMA,
      messages: [
        {
          role: 'user',
          content:
            'Create an easy to medium quiz question with three answers, preferably about the region ' +
            `or Switzerland (nearby: ${near.join(', ') || 'unknown'}), otherwise general knowledge. ` +
            `Do not repeat: ${this.asked.slice(-6).join(' | ') || '-'}.`,
        },
      ],
    });
    if (session !== this.session) return;
    const quiz = parseQuiz(raw);
    if (!quiz) throw new Error('No usable quiz question.');
    if (!this.free()) {
      this.nextAt = Date.now() + RETRY_MS;
      return;
    }
    this.asked.push(quiz.question);
    this.picked = null;
    this._quiz.set(quiz);
    const options = QUIZ_KEYS.map((key) => `${key.toUpperCase()}: ${quiz[key]}.`).join(' ');
    const spoken = await this.say(
      this.t('copilot.talk.question', { question: quiz.question, options }),
      session,
    );
    if (session !== this.session) return;
    let answer = this.picked as QuizKey | null;
    if (!answer && spoken && this.free()) {
      const heard = await this.listen(session);
      if (session !== this.session) return;
      if (isStop(heard)) return this.stop();
      answer = (this.picked as QuizKey | null) ?? quizAnswer(heard, quiz);
    }
    this._quiz.set(null);
    if (!answer && !spoken) {
      // Interrupted: it does not count as a wrong answer.
      this.nextAt = Date.now() + QUIZ_PAUSE_MS;
      return;
    }
    const right = answer === quiz.correct;
    this._score.update((s) => ({ right: s.right + (right ? 1 : 0), asked: s.asked + 1 }));
    const result = right ? 'right' : answer ? 'wrong' : 'none';
    const verdict = this.t('copilot.talk.' + result, { key: quiz.correct.toUpperCase() });
    await this.say(`${verdict} ${quiz.explanation}`.trim(), session);
    if (session === this.session) this.nextAt = Date.now() + QUIZ_PAUSE_MS;
  }

  private async reply(text: string, session: number): Promise<string> {
    const messages: ChatMessage[] = [
      ...this.history,
      { role: 'user', content: `[Context: ${this.context()}] ${text}` },
    ];
    const answer = await this.model.ask({ system: passengerPrompt(this.translate.lang), messages });
    if (session !== this.session) return '';
    const all: ChatMessage[] = [...messages, { role: 'assistant', content: answer }];
    this.history = all.slice(-MAX_HISTORY);
    return answer;
  }

  private async say(text: string, session: number): Promise<boolean> {
    if (session !== this.session) return false;
    this.copilot.add('assistant', text);
    return this.output.speak(text, this.translate.lang, this.settings().voice.rate, 'talk');
  }

  private async listen(session: number): Promise<string> {
    if (this.deaf || session !== this.session) return '';
    this._listening.set(true);
    try {
      return await this.input.listen(this.translate.lang === 'de' ? 'de-CH' : 'en-GB', LISTEN_MS);
    } catch (error) {
      if (error instanceof ListeningUnavailableError) {
        this.deaf = true;
        this._notice.set('no_microphone');
      }
      return '';
    } finally {
      if (session === this.session) this._listening.set(false);
    }
  }

  private free(): boolean {
    return mayTalk({
      maneuverM: this.navigation.progress()?.distanceM ?? null,
      speaking: this.output.busy(),
      visible: !document.hidden,
      warning: this.warnings.shown() !== null || this.road.hazard() !== null,
    });
  }

  /** Places nearby; asked again only after some kilometres. */
  private async loadAround(): Promise<void> {
    const at = this.positions.position()?.coordinate;
    if (!at) return;
    if (this.around && distanceM(this.around.at, at) < LANDMARKS_VALID_M) return;
    this.around = { at, places: await this.landmarks.near(at, this.translate.lang) };
  }

  private placesAround(): LandmarkAround[] {
    const position = this.positions.position();
    if (!position || !this.around) return [];
    const { coordinate, heading } = position;
    const { speed } = this.telemetry.snapshot();
    return this.around.places.map((place) => ({
      ...place,
      distanceM: distanceM(coordinate, place.at),
      direction: directionTo(bearing(coordinate, place.at), heading, speed),
    }));
  }

  private context(): string {
    const near = (this.around?.places ?? []).slice(0, 6).map(({ title }) => title);
    const { coolantTemp, speed } = this.telemetry.snapshot();
    const connected = ['obd', 'demo'].includes(this.telemetry.mode());
    const car = carRemark(this.fuel.rangeKm(), coolantTemp, speed, connected);
    const parts = [
      car ? `car: ${car}` : '',
      `street: ${this.scene.street() || 'unknown'}`,
      near.length ? `nearby: ${near.join(', ')}` : '',
      `time: ${new Date().toTimeString().slice(0, 5)}`,
    ];
    return parts.filter(Boolean).join('; ');
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.translate(key, params) ?? key;
  }
}
