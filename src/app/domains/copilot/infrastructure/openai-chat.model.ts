import { Injectable, inject } from '@angular/core';
import { HttpPort } from '@core/http';
import { SettingsStore, aiProvider } from '@domains/settings';
import { ChatError, ChatModel, ChatRequest } from '../domain/copilot';
import { AnthropicChatModel } from './anthropic-chat.model';

const URL = 'https://api.openai.com/v1/responses';
/** Thinking counts too, so this is far more than the short answers need. */
const MAX_TOKENS = 3000;

interface OpenAiAnswer {
  readonly output?: {
    readonly type: string;
    readonly content?: { readonly type: string; readonly text?: string }[];
  }[];
  readonly error?: { readonly code?: string; readonly message?: string } | null;
}

/** ChatGPT, with the user's own key. */
@Injectable()
export class OpenAiChatModel extends ChatModel {
  private readonly http = inject(HttpPort);
  private readonly settings = inject(SettingsStore).settings;

  async ask({ system, messages, schema }: ChatRequest): Promise<string> {
    const { keys, ai } = this.settings();
    if (!keys.openai) throw new ChatError('key');
    const response = await this.http
      .fetch(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + keys.openai },
        body: JSON.stringify({
          model: ai.model,
          instructions: system,
          input: messages,
          max_output_tokens: MAX_TOKENS,
          // Nothing is kept at OpenAI for later requests.
          store: false,
          ...(schema
            ? { text: { format: { type: 'json_schema', name: 'answer', schema, strict: true } } }
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
    const parts = (answer?.output ?? []).flatMap(({ content }) => content ?? []);
    if (parts.some(({ type }) => type === 'refusal')) throw new ChatError('refused');
    const text = parts
      .flatMap((part) => (part.type === 'output_text' && part.text ? [part.text] : []))
      .join('\n')
      .trim();
    if (!text) throw new ChatError('other', 'Empty answer');
    return text;
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
