import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppSettings, DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { copilotTesting } from '../testing';
import { MemoryStore } from './memory.store';

describe('MemoryStore', () => {
  const settings = signal<AppSettings>(DEFAULT_SETTINGS);
  const update = async ({ ai }: { ai: Partial<AppSettings['ai']> }) =>
    settings.update((s) => ({ ...s, ai: { ...s.ai, ...ai } }));
  let ai: ReturnType<typeof copilotTesting>;
  let store: MemoryStore;
  const answer = JSON.stringify({ facts: [{ text: 'Mag Jazz', words: ['musik'] }] });

  beforeEach(async () => {
    settings.set(DEFAULT_SETTINGS);
    ai = copilotTesting();
    TestBed.configureTestingModule({
      providers: [...ai.providers, { provide: SettingsStore, useValue: { settings, update } }],
    });
    store = TestBed.inject(MemoryStore);
    await store.load();
  });

  it('learns from a talk and sends only a short note', async () => {
    ai.model.answers = [answer];
    store.heard('Welche Musik magst du?', 'Jazz');
    await store.learn(false);
    expect(ai.model.requests).toEqual([]);
    await store.learn(true);
    expect(ai.memory.stored.facts).toHaveLength(1);
    expect(store.notes('musik')).toBe('Mag Jazz');
    await store.learn(true);
    expect(ai.model.requests).toHaveLength(1);
  });

  it('does not bring back what was deleted meanwhile', async () => {
    ai.model.answers = [answer];
    store.heard('?', 'Jazz');
    const learning = store.learn(true);
    await store.forgetAll();
    await learning;
    expect(store.facts()).toEqual([]);
  });

  it('neither learns nor tells when it is off', async () => {
    ai.model.answers = [answer];
    store.heard('?', 'Jazz');
    await store.learn(true);
    await store.setEnabled(false);
    expect(store.notes('musik')).toBe('');
    store.heard('?', 'Rock');
    await store.learn(true);
    expect(ai.model.requests).toHaveLength(1);
    await store.forget(store.facts()[0].id);
    expect(ai.memory.stored.facts).toEqual([]);
  });
});
