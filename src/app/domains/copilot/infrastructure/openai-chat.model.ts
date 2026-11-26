import { Injectable, inject } from '@angular/core';
import { HttpPort } from '@core/http';
import { SettingsStore, aiProvider } from '@domains/settings';
import { ChatError, ChatModel, ChatRequest, MAX_TOOL_ROUNDS } from '../domain/copilot';
import { AnthropicChatModel } from './anthropic-chat.model';

const URL = 'https://api.openai.com/v1/responses';
/** Thinking counts too, so this is far more than the short answers need. */
const MAX_TOKENS = 3000;
const TIMEOUT_MS = 45_000;

interface OpenAiAnswer {
  readonly output?: {
    readonly type: string;
    readonly content?: { readonly type: string; readonly text?: string }[];
    /** function calls */
    readonly call_id?: string;
    readonly name?: string;
    readonly arguments?: string;
  }[];
  readonly error?: { readonly code?: string; readonly message?: string } | null;
}

/** ChatGPT, with the user's own key. */
@Injectable()
export class OpenAiChatModel extends ChatModel {
  private readonly http = inject(HttpPort);
  private readonly settings = inject(SettingsStore).settings;

  async ask({ system, messages, schema, tools, runTool }: ChatRequest): Promise<string> {
    const { keys, ai } = this.settings();
    if (!keys.openai) throw new ChatError('key');
    const offered = runTool && tools?.length ? tools : null;
    const input: unknown[] = [...messages];
    for (let round = 0; ; round++) {
      const last = round >= MAX_TOOL_ROUNDS;
      const answer = await this.once(keys.openai, ai.model, system, input, schema, offered, last);
      const output = answer.output ?? [];
      const calls = output.filter(({ type }) => type === 'function_call');
      if (offered && runTool && calls.length && !last) {
        for (const call of calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.arguments || '{}') as Record<string, unknown>;
          } catch {
            // A broken input is answered like an empty one.
          }
          const result = await runTool(call.name ?? '', args);
          // Nothing is stored at OpenAI, so only the calls are sent back, not the thinking.
          const { call_id, name, arguments: given } = call;
          input.push(
            { type: 'function_call', call_id, name, arguments: given },
            { type: 'function_call_output', call_id, output: result },
          );
        }
        continue;
      }
      const parts = output.flatMap(({ content }) => content ?? []);
      if (parts.some(({ type }) => type === 'refusal')) throw new ChatError('refused');
      const text = parts
        .flatMap((part) => (part.type === 'output_text' && part.text ? [part.text] : []))
        .join('\n')
        .trim();
      if (!text) throw new ChatError('other', 'Empty answer');
      return text;
    }
  }

  private async once(
    key: string,
    model: string,
    system: string,
    input: readonly unknown[],
    schema: ChatRequest['schema'],
    tools: ChatRequest['tools'] | null,
    last: boolean,
  ): Promise<OpenAiAnswer> {
    const response = await this.http
      .fetch(URL, {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify({
          model,
          instructions: system,
          input,
          max_output_tokens: MAX_TOKENS,
          // Nothing is kept at OpenAI for later requests.
          store: false,
          ...(schema
            ? { text: { format: { type: 'json_schema', name: 'answer', schema, strict: true } } }
            : {}),
          ...(tools
            ? {
                tools: tools.map(({ name, description, input: parameters }) => ({
                  type: 'function',
                  name,
                  description,
                  parameters: { type: 'object', ...parameters },
                  strict: false,
                })),
                tool_choice: last ? 'none' : 'auto',
              }
            : {}),
        }),
      })
      .catch(() => {
        throw new ChatError('offline');
      });
    const answer = (await response.json().catch(() => null)) as OpenAiAnswer | null;
    if (response.status === 401 || response.status === 403) throw new ChatError('key');
    if (response.status === 429) throw new ChatError('quota');
    if (!response.ok) throw new ChatError('other', answer?.error?.message);
    return answer ?? {};
  }
}

/** Uses the provider of the model chosen in the settings. */
@Injectable()
export class ChosenChatModel extends ChatModel {
  private readonly settings = inject(SettingsStore).settings;
  private readonly models = {
    anthropic: inject(AnthropicChatModel),
    openai: inject(OpenAiChatModel),
  };

  ask(request: ChatRequest): Promise<string> {
    return this.models[aiProvider(this.settings().ai.model)].ask(request);
  }
}
