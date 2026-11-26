import { Injectable, inject } from '@angular/core';
import type { MessageCreateParamsNonStreaming as BetaParams } from '@anthropic-ai/sdk/resources/beta/messages';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { HttpPort } from '@core/http';
import { SettingsStore } from '@domains/settings';
import { ChatError, ChatModel, ChatRequest, MAX_TOOL_ROUNDS } from '../domain/copilot';

/** Thinking counts too, so this is far more than the short answers need. */
const MAX_TOKENS = 3000;
const TIMEOUT_MS = 45_000;

/** Claude, with the user's own key or through the user's proxy. */
@Injectable()
export class AnthropicChatModel extends ChatModel {
  private readonly http = inject(HttpPort);
  private readonly settings = inject(SettingsStore).settings;

  async ask({ system, messages, schema, tools, runTool }: ChatRequest): Promise<string> {
    const { keys, proxyUrl, ai } = this.settings();
    if (!keys.anthropic && !proxyUrl) throw new ChatError('key');
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({
      // A proxy adds the key itself; the SDK wants something to send.
      apiKey: keys.anthropic || 'proxy',
      ...(proxyUrl ? { baseURL: proxyUrl.replace(/\/+$/, '') } : {}),
      // The key is the user's own, entered on this device.
      dangerouslyAllowBrowser: true,
      maxRetries: 1,
      timeout: TIMEOUT_MS,
      fetch: (input, init) => this.http.fetch(String(input), init ?? {}),
    });
    const offered = runTool && tools?.length ? tools : null;
    // Earlier turns of the tools are sent along as they came.
    const conversation: unknown[] = messages.map(({ role, content }) => ({ role, content }));
    try {
      for (let round = 0; ; round++) {
        const last = round >= MAX_TOOL_ROUNDS;
        const params = {
          model: ai.model,
          max_tokens: MAX_TOKENS,
          system,
          messages: conversation as MessageParam[],
          output_config: {
            effort: 'low' as const,
            ...(schema ? { format: { type: 'json_schema' as const, schema } } : {}),
          },
          ...(offered
            ? {
                tools: offered.map(({ name, description, input }) => ({
                  name,
                  description,
                  input_schema: { type: 'object' as const, ...input },
                })),
                tool_choice: { type: last ? ('none' as const) : ('auto' as const) },
              }
            : {}),
        };
        // If the safety filter of the larger models declines by mistake, another one answers.
        const response = /haiku/.test(ai.model)
          ? await client.messages.create(params)
          : await client.beta.messages.create({
              ...(params as unknown as BetaParams),
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default',
            });
        if (response.stop_reason === 'refusal') throw new ChatError('refused');
        const uses = response.content.flatMap((block) =>
          block.type === 'tool_use' ? [block] : [],
        );
        if (offered && runTool && uses.length && !last) {
          const results = [];
          for (const use of uses) {
            const input = (use.input ?? {}) as Record<string, unknown>;
            results.push({
              type: 'tool_result',
              tool_use_id: use.id,
              content: await runTool(use.name, input),
            });
          }
          conversation.push(
            { role: 'assistant', content: response.content },
            { role: 'user', content: results },
          );
          continue;
        }
        const text = response.content
          .flatMap((block) => (block.type === 'text' ? [block.text] : []))
          .join('\n')
          .trim();
        if (!text) throw new ChatError('other', 'Empty answer');
        return text;
      }
    } catch (error) {
      if (error instanceof ChatError) throw error;
      if (error instanceof Anthropic.AuthenticationError) throw new ChatError('key');
      if (error instanceof Anthropic.PermissionDeniedError) throw new ChatError('key');
      if (error instanceof Anthropic.RateLimitError) throw new ChatError('quota');
      if (error instanceof Anthropic.APIConnectionError) throw new ChatError('offline');
      if (error instanceof Anthropic.APIError) {
        // No credit left is reported as a bad request.
        const credit = /credit|billing/i.test(error.message);
        throw new ChatError(credit ? 'quota' : 'other', error.message);
      }
      throw error;
    }
  }
}
