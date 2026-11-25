import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpPort } from '@core/http';
import { DEFAULT_SETTINGS, SettingsStore } from '@domains/settings';
import { OpenAiChatModel } from './openai-chat.model';

describe('OpenAiChatModel', () => {
  const fetch = vi.fn();

  function ask(schema?: Record<string, unknown>): Promise<string> {
    const settings = signal({
      ...DEFAULT_SETTINGS,
      ai: { model: 'gpt-6-luna' },
      keys: { ...DEFAULT_SETTINGS.keys, openai: 'sk-test' },
    });
    TestBed.configureTestingModule({
      providers: [
        OpenAiChatModel,
        { provide: HttpPort, useValue: { fetch } },
        { provide: SettingsStore, useValue: { settings } },
      ],
    });
    const messages = [{ role: 'user' as const, content: 'Hallo' }];
    return TestBed.inject(OpenAiChatModel).ask({ system: 'S', messages, schema });
  }

  const answer = (status: number, body: unknown) =>
    fetch.mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it('asks without storing and reads the text', async () => {
    answer(200, {
      output: [
        { type: 'reasoning' },
        { type: 'message', content: [{ type: 'output_text', text: 'Guten Tag.' }] },
      ],
    });
    expect(await ask({ type: 'object' })).toBe('Guten Tag.');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'gpt-6-luna',
      instructions: 'S',
      store: false,
      text: { format: { type: 'json_schema' } },
    });
  });

  it.each([
    [401, 'key'],
    [429, 'quota'],
    [500, 'other'],
  ])('explains status %i', async (status, reason) => {
    answer(status, {});
    await expect(ask()).rejects.toMatchObject({ reason });
  });

  it('notices refusals and lost connections', async () => {
    answer(200, { output: [{ type: 'message', content: [{ type: 'refusal' }] }] });
    await expect(ask()).rejects.toMatchObject({ reason: 'refused' });
    TestBed.resetTestingModule();
    fetch.mockRejectedValue(new TypeError('network'));
    await expect(ask()).rejects.toMatchObject({ reason: 'offline' });
  });
});
