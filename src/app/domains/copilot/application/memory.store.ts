import { Injectable, computed, inject, signal } from '@angular/core';
import { SettingsStore } from '@domains/settings';
import { ChatMessage, ChatModel } from '../domain/copilot';
import {
  DriverMemory,
  FACTS_SCHEMA,
  MemoryRepository,
  NO_MEMORY,
  factsFor,
  factsPrompt,
  parseFacts,
  talkText,
  topicWeight,
  withFacts,
  withReaction,
  withUsed,
  withoutFact,
} from '../domain/memory';
import { Topic } from '../domain/passenger';

/** So many answers are worth a request. */
const ENOUGH_ANSWERS = 4;
const MAX_TALK = 16;

/** What the passenger remembers about the driver. Stays on the device. */
@Injectable({ providedIn: 'root' })
export class MemoryStore {
  private readonly model = inject(ChatModel);
  private readonly repository = inject(MemoryRepository);
  private readonly settingsStore = inject(SettingsStore);

  private readonly memory = signal<DriverMemory>(NO_MEMORY);
  private loading?: Promise<void>;
  private talk: ChatMessage[] = [];
  /** Raised when the driver deletes something: a running request must not bring it back. */
  private cleared = 0;

  readonly enabled = computed(() => this.settingsStore.settings().ai.memory);
  readonly facts = computed(() => this.memory().facts);

  load(): Promise<void> {
    return (this.loading ??= this.repository.load().then(
      (memory) => this.memory.set(memory),
      () => {
        this.loading = undefined;
      },
    ));
  }

  async setEnabled(memory: boolean): Promise<void> {
    if (!memory) this.drop();
    await this.settingsStore.update({ ai: { memory } });
  }

  async forget(id: number): Promise<void> {
    await this.load();
    this.drop();
    await this.change(withoutFact(this.memory(), id));
  }

  async forgetAll(): Promise<void> {
    await this.load();
    this.drop();
    await this.change(NO_MEMORY);
  }

  /** What is sent along with a talk, '' if nothing. */
  notes(subject: string): string {
    if (!this.enabled()) return '';
    const facts = factsFor(this.memory(), subject);
    if (!facts.length) return '';
    void this.change(withUsed(this.memory(), facts, Date.now()));
    return facts.map(({ text }) => text).join(' | ');
  }

  weight(topic: Topic): number {
    return this.enabled() ? topicWeight(this.memory(), topic) : 1;
  }

  /** Whether the driver joined in. Without a language model too. */
  reacted(topic: Topic, answered: boolean): void {
    if (this.enabled()) void this.change(withReaction(this.memory(), topic, answered));
  }

  heard(passenger: string, driver: string): void {
    if (!this.enabled()) return;
    const pair: ChatMessage[] = [
      { role: 'assistant', content: passenger },
      { role: 'user', content: driver },
    ];
    this.talk = [...this.talk, ...pair].slice(-MAX_TALK);
  }

  /** Looks for something to remember; at the end also in a short talk. */
  async learn(end: boolean): Promise<void> {
    const answers = this.talk.length / 2;
    if (!this.enabled() || !answers || (!end && answers < ENOUGH_ANSWERS)) return;
    const talk = this.talk;
    const cleared = this.cleared;
    this.talk = [];
    await this.load();
    try {
      const raw = await this.model.ask({
        system: factsPrompt(this.facts()),
        messages: [{ role: 'user', content: talkText(talk) }],
        schema: FACTS_SCHEMA,
      });
      const found = parseFacts(raw);
      if (!found.length || cleared !== this.cleared || !this.enabled()) return;
      await this.change(withFacts(this.memory(), found, Date.now()));
    } catch {
      // Without a connection this talk is simply not remembered.
    }
  }

  private drop(): void {
    this.cleared++;
    this.talk = [];
  }

  private async change(memory: DriverMemory): Promise<void> {
    // Saving before loading would overwrite what is stored.
    if (!this.loading) return;
    this.memory.set(memory);
    await this.repository.save(memory).catch(() => undefined);
  }
}
