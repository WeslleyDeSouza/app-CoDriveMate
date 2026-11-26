import { Provider } from '@angular/core';
import { SpeechInput } from '@core/device';
import { Landmark, LandmarkSource, TalkRepository } from './domain/conversation';
import { ChatModel, ChatRequest } from './domain/copilot';
import { DriverMemory, MemoryRepository, NO_MEMORY } from './domain/memory';

/** An answer of the fake model that uses a tool first. */
export interface FakeToolUse {
  readonly tool: string;
  readonly input?: Record<string, unknown>;
}

export class FakeChatModel extends ChatModel {
  readonly requests: ChatRequest[] = [];
  /** What the tools gave back, in order. */
  readonly toolResults: string[] = [];
  answers: (string | Error | FakeToolUse)[] = [];

  async ask(request: ChatRequest): Promise<string> {
    this.requests.push(request);
    let answer = this.answers.shift() ?? 'ok';
    while (typeof answer === 'object' && !(answer instanceof Error)) {
      const result = request.runTool
        ? await request.runTool(answer.tool, answer.input ?? {})
        : 'No tools.';
      this.toolResults.push(result);
      answer = this.answers.shift() ?? 'ok';
    }
    if (answer instanceof Error) throw answer;
    return answer;
  }
}

export class FakeSpeechInput extends SpeechInput {
  heard: (string | Error)[] = [];
  listened = 0;
  aborted = 0;

  async listen(): Promise<string> {
    this.listened++;
    const heard = this.heard.shift() ?? '';
    if (heard instanceof Error) throw heard;
    return heard;
  }
  abort(): void {
    this.aborted++;
  }
}

export class FakeLandmarks extends LandmarkSource {
  places: Landmark[] = [];
  text = 'Ein Turm. Er ist hoch.';

  async near(): Promise<Landmark[]> {
    return this.places;
  }
  async extract(): Promise<string> {
    return this.text;
  }
}

export class FakeTalkRepository extends TalkRepository {
  seen: readonly number[] = [];

  async loadSeen(): Promise<readonly number[]> {
    return this.seen;
  }
  async saveSeen(ids: readonly number[]): Promise<void> {
    this.seen = ids;
  }
}

export class FakeMemoryRepository extends MemoryRepository {
  stored: DriverMemory = NO_MEMORY;

  async load(): Promise<DriverMemory> {
    return this.stored;
  }
  async save(memory: DriverMemory): Promise<void> {
    this.stored = memory;
  }
}

export function copilotTesting() {
  const fakes = {
    model: new FakeChatModel(),
    input: new FakeSpeechInput(),
    landmarks: new FakeLandmarks(),
    talk: new FakeTalkRepository(),
    memory: new FakeMemoryRepository(),
  };
  const providers: Provider[] = [
    { provide: ChatModel, useValue: fakes.model },
    { provide: SpeechInput, useValue: fakes.input },
    { provide: LandmarkSource, useValue: fakes.landmarks },
    { provide: TalkRepository, useValue: fakes.talk },
    { provide: MemoryRepository, useValue: fakes.memory },
  ];
  return { ...fakes, providers };
}
