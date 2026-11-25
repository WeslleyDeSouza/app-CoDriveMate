import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { fuelTesting } from '@domains/fuel/testing';
import { roadTesting } from '@domains/road/testing';
import { PositionStore } from '@domains/navigation';
import { navigationTesting } from '@domains/navigation/testing';
import { scene3dTesting } from '@domains/scene3d/testing';
import { AppSettings, DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { telemetryTesting } from '@domains/telemetry/testing';
import { findHook, hook, hooks, textOf } from '@shared/testing';
import { ConversationStore } from '../application/conversation.store';
import { ChatError } from '../domain/copilot';
import { copilotTesting } from '../testing';
import { ConversationBar } from './conversation-bar';
import { CopilotPage } from './copilot-page';

describe('copilot', () => {
  let nav: ReturnType<typeof navigationTesting>;
  let ai: ReturnType<typeof copilotTesting>;
  const settings = signal<AppSettings>(DEFAULT_SETTINGS);

  async function setup(key = 'sk-test'): Promise<void> {
    nav = navigationTesting();
    ai = copilotTesting();
    nav.gps.allowed = true;
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
        { provide: SettingsStore, useValue: { settings } },
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

  describe('conversation', () => {
    let store: ConversationStore;

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
      store.stop();
      vi.useRealTimers();
    });

    async function start(mode: 'chat' | 'facts' | 'quiz', key?: string): Promise<void> {
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
      expect(store.modes()).toEqual(['chat', 'facts', 'quiz']);
      const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
      await wait();
      expect(ai.talk.seen).toEqual([7]);
      random.mockRestore();
      store.toggle('quiz');
      expect(store.modes()).toEqual(['chat', 'facts']);
      store.toggle('chat');
      store.toggle('facts');
      expect(store.active()).toBe(false);
    });

    it('mixes only what works without a key', async () => {
      await start('facts', '');
      store.toggleAll();
      expect(store.active()).toBe(false);
      store.toggleAll();
      expect(store.modes()).toEqual(['facts']);
      expect(store.notice()).toBe('needs_key');
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
