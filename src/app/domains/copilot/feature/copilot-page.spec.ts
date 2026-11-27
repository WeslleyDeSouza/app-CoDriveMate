import { Provider, WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { fuelTesting } from '@domains/fuel/testing';
import { roadTesting } from '@domains/road/testing';
import { NavigationStore, PositionStore } from '@domains/navigation';
import { LogbookStore } from '@domains/logbook';
import { logbookTesting } from '@domains/logbook/testing';
import { MaintenanceStore } from '@domains/maintenance';
import { maintenanceTesting } from '@domains/maintenance/testing';
import { navigationTesting } from '@domains/navigation/testing';
import { scene3dTesting } from '@domains/scene3d/testing';
import { AppSettings, DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { Trip } from '@domains/logbook';
import { telemetryTesting } from '@domains/telemetry/testing';
import { findHook, hook, hooks, textOf } from '@shared/testing';
import { ConversationStore } from '../application/conversation.store';
import { ChatError } from '../domain/copilot';
import { CopilotStore } from '../application/copilot.store';
import { ASSISTANT_TOOLS, AssistantTool } from '@core/assistant';
import { TalkMode } from '../domain/conversation';
import { copilotTesting } from '../testing';
import { ConversationBar } from './conversation-bar';
import { CopilotPage } from './copilot-page';

describe('copilot', () => {
  let nav: ReturnType<typeof navigationTesting>;
  let ai: ReturnType<typeof copilotTesting>;
  let care: ReturnType<typeof maintenanceTesting>;
  const settings = signal<AppSettings>(DEFAULT_SETTINGS);
  const update = async ({ ai: change }: { ai: Partial<AppSettings['ai']> }) =>
    settings.update((s) => ({ ...s, ai: { ...s.ai, ...change } }));
  const current = signal<Trip | null>(null);
  const trips = signal<Trip[]>([]);
  const logbook = { current, trips, loaded: signal(true), load: async () => undefined };
  const TRIP: Trip = {
    id: 1,
    startedAt: new Date(2026, 10, 23, 7, 30).getTime(),
    endedAt: new Date(2026, 10, 23, 7, 35).getTime(),
    distanceKm: 1,
    fuelL: 0,
    maxSpeedKmh: 50,
    from: 'Daheim',
    to: 'Werkstrasse',
    source: 'obd',
    fuelPrice: 2,
    cost: 0,
    score: 100,
    driving: { hardAccelerations: 0, hardBrakings: 0, highRpmSeconds: 0, idleSeconds: 0 },
    path: [[8.54, 47.38]],
    end: [8.64, 47.38],
  };

  async function setup(key = 'sk-test', extra: Provider[] = []): Promise<void> {
    nav = navigationTesting();
    ai = copilotTesting();
    care = maintenanceTesting();
    nav.gps.allowed = true;
    current.set(null);
    trips.set([]);
    settings.set({ ...DEFAULT_SETTINGS, keys: { ...DEFAULT_SETTINGS.keys, anthropic: key } });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        ...telemetryTesting().providers,
        ...nav.providers,
        ...scene3dTesting().providers,
        ...fuelTesting().providers,
        ...roadTesting().providers,
        ...ai.providers,
        ...logbookTesting().providers,
        ...care.providers,
        { provide: LogbookStore, useValue: logbook },
        { provide: SettingsStore, useValue: { settings, update } },
        ...extra,
      ],
    });
    await TestBed.inject(PositionStore).start(false);
  }

  async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));
    }
    fixture.detectChanges();
  }

  describe('questions', () => {
    let fixture: ComponentFixture<CopilotPage>;
    let root: HTMLElement;

    async function open(key?: string): Promise<void> {
      await setup(key);
      fixture = TestBed.createComponent(CopilotPage);
      root = fixture.nativeElement;
      await settle(fixture);
    }

    async function ask(text: string): Promise<void> {
      hook<HTMLInputElement>(root, 'copilot-input').value = text;
      hook(root, 'copilot-send').click();
      await settle(fixture);
    }

    it('asks with data of the car, shows and reads the answer', async () => {
      await open();
      ai.model.answers = ['**Alles** gut.'];
      await ask('Wie geht es?');
      const [{ system, messages }] = ai.model.requests;
      expect(system).toContain('Xsara Picasso');
      expect(messages[0].content).toContain('<car_data>');
      expect(textOf(hook(root, 'copilot-chat'))).toContain('Alles gut.');
      expect(nav.speech.said).toEqual(['Alles gut.']);
      expect(nav.speech.kinds).toEqual(['answer']);
    });

    it('remembers the chat, but not the old values', async () => {
      await open();
      await ask('Eins');
      await ask('Zwei');
      const { messages } = ai.model.requests[1];
      expect(messages.map(({ role }) => role)).toEqual(['user', 'assistant', 'user']);
      expect(messages[0].content).toBe('Eins');
    });

    it('sends nothing without a key', async () => {
      await open('');
      await ask('Hallo');
      expect(ai.model.requests).toEqual([]);
      expect(findHook(root, 'copilot-open-settings')).not.toBeNull();
    });

    it('explains failures', async () => {
      await open();
      ai.model.answers = [new ChatError('quota')];
      await ask('Hallo');
      expect(textOf(hook(root, 'copilot-failure'))).toBe('copilot.failure.quota');
    });

    it('takes spoken questions', async () => {
      await open();
      ai.input.heard = ['Ist die Batterie gut'];
      hook(root, 'copilot-microphone').click();
      await settle(fixture);
      expect(ai.model.requests[0].messages[0].content).toContain('Ist die Batterie gut');
    });
  });

  describe('tools', () => {
    let store: CopilotStore;
    const done: string[] = [];
    const tools: AssistantTool[] = [
      {
        name: 'remember_parking',
        description: 'Remembers the parking spot.',
        input: { properties: {} },
        run: async () => (done.push('parked'), 'Parking spot saved.'),
      },
      {
        name: 'set_destination',
        description: 'Starts a route.',
        input: { properties: { query: { type: 'string' } }, required: ['query'] },
        run: async (input, { confirm }) => {
          if (!(await confirm(`Route nach ${String(input['query'])} starten?`))) return 'Declined.';
          done.push('route ' + String(input['query']));
          return 'Route started.';
        },
      },
    ];

    async function begin(): Promise<void> {
      done.length = 0;
      await setup(
        'sk-test',
        tools.map((tool) => ({ provide: ASSISTANT_TOOLS, useValue: tool, multi: true })),
      );
      store = TestBed.inject(CopilotStore);
    }

    it('acts with a tool and answers with what came of it', async () => {
      await begin();
      ai.model.answers = [{ tool: 'remember_parking' }, 'Ich habe den Parkplatz gemerkt.'];
      await store.ask('Merk dir, wo ich parke');
      const [request] = ai.model.requests;
      expect(request.tools?.map(({ name }) => name)).toEqual([
        'remember_parking',
        'set_destination',
      ]);
      expect(request.system).toContain('You can act with the tools');
      expect(done).toEqual(['parked']);
      expect(ai.model.toolResults).toEqual(['Parking spot saved.']);
      expect(nav.speech.said).toEqual(['Ich habe den Parkplatz gemerkt.']);
    });

    it('starts a route only after a spoken yes', async () => {
      await begin();
      ai.input.heard = ['Ja gerne'];
      ai.model.answers = [{ tool: 'set_destination', input: { query: 'Fitness' } }, 'Los gehts.'];
      await store.ask('Bring mich ins Fitness');
      expect(nav.speech.said[0]).toBe('Route nach Fitness starten?');
      expect(done).toEqual(['route Fitness']);
      expect(store.question()).toBeNull();
    });

    it('does nothing on a no, by voice or by tap', async () => {
      await begin();
      ai.input.heard = ['Nein danke'];
      ai.model.answers = [{ tool: 'set_destination', input: { query: 'Fitness' } }, 'Gut.'];
      await store.ask('Bring mich ins Fitness');
      expect(ai.model.toolResults).toEqual(['Declined.']);

      ai.model.answers = [{ tool: 'set_destination', input: { query: 'Büro' } }, 'Los.'];
      const asking = store.ask('Ins Büro');
      await vi.waitFor(() => expect(store.question()).toContain('Büro'));
      store.answer(true);
      await asking;
      expect(done).toEqual(['route Büro']);
    });

    it('offers no tools when switched off in the privacy settings', async () => {
      await begin();
      settings.update((s) => ({ ...s, ai: { ...s.ai, tools: false } }));
      await store.ask('Merk dir den Parkplatz');
      expect(ai.model.requests[0].tools).toBeUndefined();
      expect(ai.model.requests[0].system).not.toContain('You can act with the tools');
    });
  });

  describe('conversation', () => {
    let store: ConversationStore;

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
      store.stop();
      vi.useRealTimers();
    });

    async function start(mode: TalkMode, key?: string): Promise<void> {
      await setup(key);
      store = TestBed.inject(ConversationStore);
      nav.gps.emit([8.54, 47.38], 0);
      store.toggle(mode);
    }
    const wait = (ms = 3000) => vi.advanceTimersByTimeAsync(ms);

    it('tells facts without a key', async () => {
      await start('facts', '');
      ai.landmarks.places = [{ id: 7, title: 'Turm', at: [8.54, 47.39] }];
      await wait();
      expect(nav.speech.said[0]).toContain('Turm');
      expect(nav.speech.kinds).toEqual(['talk']);
      expect(ai.talk.seen).toEqual([7]);
      expect(ai.model.requests).toEqual([]);
    });

    it('needs a key for chat and quiz', async () => {
      await start('chat', '');
      expect(store.active()).toBe(false);
      expect(store.notice()).toBe('needs_key');
    });

    it('talks, listens and stops when asked to', async () => {
      await start('chat');
      ai.model.answers = ['Hallo!', 'Schön.'];
      ai.input.heard = ['Wie geht es dir?', 'Stopp'];
      await wait();
      expect(nav.speech.said).toEqual(['Hallo!', 'Schön.', 'copilot.talk.quiet']);
      expect(store.active()).toBe(false);
    });

    it('does not listen after it was interrupted', async () => {
      await start('chat');
      nav.speech.completes = false;
      await wait();
      expect(nav.speech.said).toHaveLength(1);
      expect(ai.input.listened).toBe(0);
    });

    it('takes along what it remembers and whether the driver joined in', async () => {
      await start('chat');
      ai.memory.stored = {
        facts: [{ id: 1, text: 'Mag Jazz', words: [], at: 1, usedAt: 0 }],
        topics: {},
      };
      ai.model.answers = ['Hallo!', 'Schön.', '{"facts":[]}'];
      ai.input.heard = ['Ja!', 'Stopp'];
      await wait();
      expect(ai.model.requests[0].messages[0].content).toContain('Mag Jazz');
      expect(ai.model.requests[0].system).not.toContain('Mag Jazz');
      expect(Object.values(ai.memory.stored.topics)).toEqual([{ answered: 1, ignored: 0 }]);
      expect(ai.model.requests.at(-1)?.messages[0].content).toContain('Driver: Ja!');
    });

    it('knows what it told before, also on an earlier drive, and does not keep the list', async () => {
      await start('chat');
      await store.setStyle('monologue');
      await store.setPace('much');
      ai.talk.told = ['Der Witz vom Tunnel.'];
      ai.model.answers = ['Es war einmal ein Tram.', 'Und dann der Föhn.'];
      await wait(40_000);
      const [first, second] = ai.model.requests.map(({ messages }) => messages);
      expect(first[0].content).toContain('Der Witz vom Tunnel.');
      expect(second.at(-1)?.content).toContain('Der Witz vom Tunnel. | Es war einmal ein Tram.');
      // In the chat kept, the list is not repeated with every message.
      expect(second[0].content).not.toContain('Tunnel');
      expect(ai.talk.told.slice(0, 2)).toEqual(['Der Witz vom Tunnel.', 'Es war einmal ein Tram.']);
    });

    it('looks up the car and the drive instead of getting them every time', async () => {
      await start('chat');
      await store.setStyle('monologue');
      current.set({ ...TRIP, distanceKm: 12, score: 90 });
      ai.model.answers = [{ tool: 'drive_figures' }, { tool: 'car_data' }, 'Sauber gefahren.'];
      await wait();
      const [request] = ai.model.requests;
      expect(request.tools?.map(({ name }) => name)).toEqual(['car_data', 'drive_figures']);
      expect(request.messages[0].content).not.toContain('eco score');
      expect(ai.model.toolResults[0]).toContain('this drive: 12 km');
      expect(ai.model.toolResults[0]).toContain('eco score 90');
      // Earlier drives stay on the device unless the driver shares them.
      expect(ai.model.toolResults[0]).toContain('not shared by the driver');
      expect(ai.model.toolResults[1]).toContain('"vehicle"');
      expect(ai.model.toolResults[1]).not.toMatch(/47\.3|8\.54/);
      expect(nav.speech.said).toEqual(['Sauber gefahren.']);
    });

    it('has a character and knows what the driver wrote, sent once only', async () => {
      await start('chat');
      await store.setStyle('monologue');
      await store.setPace('much');
      await store.setPersona('dry');
      ai.memory.stored = { facts: [], topics: {}, about: 'Ich heisse Wes.' };
      ai.model.answers = ['Eins.', 'Zwei.'];
      await wait(40_000);
      const [first, second] = ai.model.requests;
      expect(first.system).toContain('Your name is Ruth.');
      expect(first.messages[0].content).toContain('written by the driver');
      expect(first.messages[0].content).toContain('Ich heisse Wes.');
      expect(second.messages[0].content).not.toContain('Wes');
      expect(second.messages.at(-1)?.content).toContain('Ich heisse Wes.');
    });

    it('lets the driver cut in and listens at once', async () => {
      await start('chat');
      expect(store.canInterject()).toBe(true);
      ai.input.heard = ['Was ist das für ein Turm?'];
      ai.model.answers = ['Ein alter Wachturm.'];
      store.interject();
      await wait(500);
      expect(nav.speech.said).toEqual(['Ein alter Wachturm.']);
      expect(ai.model.requests[0].messages.at(-1)?.content).toContain('Was ist das für ein Turm?');
    });

    it('gives the driver the word while it is speaking', async () => {
      await start('chat');
      let end: (spoken: boolean) => void = () => undefined;
      const speak = vi.spyOn(nav.speech, 'speak');
      speak.mockImplementationOnce(() => new Promise<boolean>((done) => (end = done)));
      const stop = vi.spyOn(nav.speech, 'stop').mockImplementation(async () => end(false));
      ai.model.answers = ['Eine sehr lange Geschichte.', 'Stimmt, du hast recht.'];
      ai.input.heard = ['Moment, das stimmt nicht.'];
      await wait();
      expect(ai.input.listened).toBe(0);
      store.interject();
      await wait(500);
      expect(stop).toHaveBeenCalledWith('talk');
      expect(ai.input.listened).toBeGreaterThan(0);
      expect(nav.speech.said).toContain('Stimmt, du hast recht.');
    });

    it('cannot be cut into in a monologue', async () => {
      await start('chat');
      await store.setStyle('monologue');
      expect(store.canInterject()).toBe(false);
      store.interject();
      await wait(500);
      expect(ai.input.listened).toBe(0);
    });

    it('knows the day so far and asks what happened after a short stay', async () => {
      vi.setSystemTime(new Date(2026, 10, 27, 14, 0));
      await start('chat');
      nav.speech.busy.set(true);
      const arrival = (
        TestBed.inject(NavigationStore) as unknown as { _arrival: WritableSignal<unknown> }
      )._arrival;
      arrival.set({
        place: {
          name: 'Hallenbad',
          detail: '',
          coordinate: [8.54, 47.38],
          purpose: { topic: 'Schwimmen', note: '' },
        },
        at: Date.now(),
      });
      await wait(10 * 60_000);
      nav.gps.emit([8.55, 47.38], 0, 40);
      await wait(1000);
      expect(ai.model.requests).toEqual([]);
      nav.speech.busy.set(false);
      ai.model.answers = ['Nanu, schon wieder unterwegs?'];
      await wait(10_000);
      const asked = String(ai.model.requests[0].messages[0].content);
      expect(asked).toContain('went to "Hallenbad"');
      expect(asked).toContain('stayed only 10 minutes');
      expect(asked).toContain('earlier today');
      expect(asked).toContain('14:00 "Hallenbad" (reason: "Schwimmen"), stayed 10 min');
      expect(asked).not.toMatch(/47\.3|8\.5/);
      expect(nav.speech.said[0]).toBe('Nanu, schon wieder unterwegs?');
    });

    it('keeps no day when learning is switched off', async () => {
      await start('chat');
      await update({ ai: { memory: false } });
      nav.speech.busy.set(true);
      const arrival = (
        TestBed.inject(NavigationStore) as unknown as { _arrival: WritableSignal<unknown> }
      )._arrival;
      arrival.set({
        place: { name: 'Hallenbad', detail: '', coordinate: [8.54, 47.38] },
        at: Date.now(),
      });
      await wait(10 * 60_000);
      nav.gps.emit([8.55, 47.38], 0, 40);
      await wait(1000);
      nav.speech.busy.set(false);
      await wait(10_000);
      expect(String(ai.model.requests[0].messages[0].content)).not.toContain('Hallenbad');
      expect(ai.memory.stored.stops ?? []).toEqual([]);
    });

    it('does not remember what was cut off', async () => {
      await start('chat');
      nav.speech.completes = false;
      await wait();
      expect(ai.talk.told).toEqual([]);
    });

    it('tries again soon after it was interrupted', async () => {
      await start('chat');
      nav.speech.completes = false;
      await wait();
      await wait(20_000);
      expect(nav.speech.said.length).toBeGreaterThan(1);
    });

    it('talks more often when told to', async () => {
      await start('chat');
      await store.setStyle('monologue');
      await store.setPace('little');
      await wait(60_000);
      expect(nav.speech.said).toHaveLength(1);
      await store.setPace('much');
      await wait(60_000);
      expect(nav.speech.said.length).toBeGreaterThan(3);
    });

    it('stays silent while something else is spoken', async () => {
      await start('chat');
      nav.speech.busy.set(true);
      await wait(10_000);
      expect(nav.speech.said).toEqual([]);
    });

    it('asks a quiz question and counts the answer', async () => {
      await start('quiz');
      ai.model.answers = [
        '{"question":"?","a":"Dom","b":"Eiger","c":"Rigi","correct":"b","explanation":"Ja."}',
      ];
      ai.input.heard = ['B'];
      await wait();
      expect(ai.model.requests[0].schema).toBeDefined();
      expect(store.score()).toEqual({ right: 1, asked: 1 });
      expect(ai.talk.told).toEqual(['?']);
      expect(nav.speech.said[1]).toBe('copilot.talk.right Ja.');
    });

    it('ends a rejected key instead of trying again', async () => {
      await start('quiz');
      ai.model.answers = [new ChatError('key')];
      await wait();
      expect(store.active()).toBe(false);
      expect(store.notice()).toBe('key_rejected');
    });

    it('mixes all modes and takes one away again', async () => {
      await start('facts');
      ai.landmarks.places = [{ id: 7, title: 'Turm', at: [8.54, 47.39] }];
      store.toggleAll();
      expect(store.modes()).toEqual(['ride', 'tips', 'eco', 'chat', 'facts', 'quiz']);
      const random = vi.spyOn(Math, 'random').mockReturnValue(0.7);
      await wait();
      expect(ai.talk.seen).toEqual([7]);
      random.mockRestore();
      store.toggle('quiz');
      expect(store.modes()).toEqual(['ride', 'tips', 'eco', 'chat', 'facts']);
      store.toggle('ride');
      store.toggle('tips');
      store.toggle('eco');
      store.toggle('chat');
      store.toggle('facts');
      expect(store.active()).toBe(false);
    });

    it('mixes only what works without a key', async () => {
      await start('facts', '');
      store.toggleAll();
      expect(store.modes()).toEqual(['ride', 'tips', 'eco', 'facts']);
      expect(store.notice()).toBe('needs_key');
      store.toggleAll();
      expect(store.active()).toBe(false);
    });

    it('only tells in a monologue, without a quiz', async () => {
      await start('chat');
      store.toggle('quiz');
      await store.setStyle('monologue');
      expect(store.modes()).toEqual(['chat']);
      expect(store.offered()).not.toContain('quiz');
      ai.model.answers = ['Es war einmal.'];
      await wait();
      expect(nav.speech.said).toEqual(['Es war einmal.']);
      expect(ai.input.listened).toBe(0);
      expect(ai.model.requests[0].system).toContain('never ask a question');
    });

    it('stops talking when a warning comes or the app is hidden', async () => {
      await start('chat');
      const stop = vi.spyOn(nav.speech, 'stop');
      vi.spyOn(nav.speech, 'speak').mockReturnValue(new Promise(() => undefined));
      ai.model.answers = ['Lang.'];
      await wait();
      stop.mockClear();
      const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      await wait(1000);
      expect(stop).toHaveBeenCalledWith('talk');
      hidden.mockRestore();
    });

    it('says at the start of a drive what is due for the car, once and without sending it', async () => {
      await start('ride', '');
      care.repository.plan = { vignetteYear: 2020 };
      await TestBed.inject(MaintenanceStore).load();
      current.set(TRIP);
      await wait();
      expect(nav.speech.said).toEqual(['copilot.talk.briefing.service']);
      await wait(600_000);
      expect(nav.speech.said).toHaveLength(1);
      expect(ai.model.requests).toEqual([]);
    });

    it('remarks on the drive once, without a key and without sending it', async () => {
      await start('ride', '');
      current.set({ ...TRIP, driving: { ...TRIP.driving, hardBrakings: 4 } });
      await wait();
      expect(nav.speech.said).toEqual(['copilot.talk.remark.braking']);
      await wait(600_000);
      expect(nav.speech.said).toHaveLength(1);
      expect(ai.model.requests).toEqual([]);
    });

    const earlier = (score: number): Trip => ({ ...TRIP, id: score, distanceKm: 10, score });

    it('compares with earlier drives on the device only, unless allowed', async () => {
      await start('eco');
      trips.set([earlier(70), earlier(71), earlier(72)]);
      current.set({ ...TRIP, id: 99, distanceKm: 12, score: 90 });
      await wait();
      expect(nav.speech.said).toEqual(['copilot.talk.eco.score_better']);
      expect(ai.model.requests).toEqual([]);
    });

    it('puts a tip in its own words with a key, and sends averages only when allowed', async () => {
      await start('tips');
      await update({ ai: { shareTrips: true } });
      trips.set([earlier(70), earlier(71), earlier(72)]);
      current.set({ ...TRIP, id: 99, distanceKm: 4, score: 90 });
      ai.model.answers = ['Zwei Sekunden Abstand, mein Freund.'];
      await wait();
      expect(nav.speech.said).toEqual(['Zwei Sekunden Abstand, mein Freund.']);
      const request = String(ai.model.requests[0].messages[0].content);
      expect(request).toContain('copilot.talk.tips.');
      expect(request).toContain('average of the last 3 drives');
      expect(request).not.toContain('Werkstrasse');
      expect(ai.talk.told).toEqual(['Zwei Sekunden Abstand, mein Freund.']);
    });

    it('says something light a few seconds after a hard braking', async () => {
      await start('ride', '');
      current.set(TRIP);
      await wait(1000);
      current.set({ ...TRIP, driving: { ...TRIP.driving, hardBrakings: 1 } });
      await wait(1000);
      expect(nav.speech.said).toEqual([]);
      await wait(5000);
      expect(nav.speech.said).toHaveLength(1);
      expect(nav.speech.said[0]).toMatch(/^copilot\.talk\.brake\.\d$/);
      // Not after every braking.
      current.set({ ...TRIP, driving: { ...TRIP.driving, hardBrakings: 2 } });
      await wait(10_000);
      expect(nav.speech.said).toHaveLength(1);
    });

    async function offer(heard: string) {
      await start('ride', '');
      const go = vi.spyOn(TestBed.inject(NavigationStore), 'navigateTo').mockResolvedValue(true);
      const week = 7 * 86_400_000;
      trips.set([1, 2, 3].map((i) => ({ ...TRIP, id: i, startedAt: TRIP.startedAt - i * week })));
      current.set(TRIP);
      ai.input.heard = [heard];
      await wait();
      return go;
    }

    it('offers the usual destination and starts it on a yes', async () => {
      const go = await offer('Ja gerne');
      expect(nav.speech.said).toEqual(['copilot.talk.usual_offer']);
      expect(go).toHaveBeenCalledWith({
        name: 'Werkstrasse',
        detail: '',
        coordinate: [8.64, 47.38],
      });
    });

    it('does not start a route without a clear yes', async () => {
      const go = await offer('Nein danke');
      expect(go).not.toHaveBeenCalled();
    });

    it('falls silent when it is switched off in the settings', async () => {
      await start('facts');
      settings.update((s) => ({ ...s, voice: { ...s.voice, conversation: false } }));
      TestBed.tick();
      expect(store.active()).toBe(false);
      store.toggle('facts');
      expect(store.active()).toBe(false);
    });

    it('ends with one tap on the bar', async () => {
      await start('facts');
      const fixture = TestBed.createComponent(ConversationBar);
      fixture.detectChanges();
      expect(hooks(fixture.nativeElement, 'conversation-answer-')).toHaveLength(0);
      hook(fixture.nativeElement, 'conversation-stop').click();
      expect(store.active()).toBe(false);
    });
  });
});
