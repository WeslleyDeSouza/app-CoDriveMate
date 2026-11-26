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

  it('runs a tool and sends back only the call and its result', async () => {
    TestBed.configureTestingModule({
      providers: [
        OpenAiChatModel,
        { provide: HttpPort, useValue: { fetch } },
        {
          provide: SettingsStore,
          useValue: {
            settings: signal({
              ...DEFAULT_SETTINGS,
              keys: { ...DEFAULT_SETTINGS.keys, openai: 'sk-test' },
            }),
          },
        },
      ],
    });
    fetch.mockReset();
    fetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: [
              { type: 'reasoning', id: 'rs_1' },
              { type: 'function_call', call_id: 'c1', name: 'find_fuel', arguments: '{}' },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: [
              { type: 'message', content: [{ type: 'output_text', text: 'Zwei gefunden.' }] },
            ],
          }),
        ),
      );
    const runTool = vi.fn().mockResolvedValue('2 found.');
    const text = await TestBed.inject(OpenAiChatModel).ask({
      system: 'S',
      messages: [{ role: 'user', content: 'Tankstelle?' }],
      tools: [{ name: 'find_fuel', description: 'Finds fuel.', input: { properties: {} } }],
      runTool,
    });
    expect(text).toBe('Zwei gefunden.');
    expect(runTool).toHaveBeenCalledWith('find_fuel', {});
    const first = JSON.parse(fetch.mock.calls[0][1].body);
    expect(first.tools[0]).toMatchObject({ type: 'function', name: 'find_fuel' });
    expect(first.tool_choice).toBe('auto');
    const second = JSON.parse(fetch.mock.calls[1][1].body);
    expect(second.input.slice(1)).toEqual([
      { type: 'function_call', call_id: 'c1', name: 'find_fuel', arguments: '{}' },
      { type: 'function_call_output', call_id: 'c1', output: '2 found.' },
    ]);
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
