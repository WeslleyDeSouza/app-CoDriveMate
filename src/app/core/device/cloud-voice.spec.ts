import { TestBed } from '@angular/core/testing';
import { HttpPort } from '@core/http';
import { CacheStore } from '@core/storage';
import { CloudVoice } from './cloud-voice';

describe('CloudVoice', () => {
  const fetch = vi.fn();
  const fetchBinary = vi.fn();
  const stored = new Map<string, unknown>();
  let voice: CloudVoice;

  beforeEach(() => {
    fetch.mockReset();
    fetchBinary.mockReset();
    stored.clear();
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    vi.stubGlobal(
      'Audio',
      class {
        onended?: () => void;
        async play() {
          setTimeout(() => this.onended?.());
        }
        pause() {
          /* silent */
        }
      },
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: HttpPort, useValue: { fetch, fetchBinary } },
        {
          provide: CacheStore,
          useValue: {
            get: async (_: string, key: string) => stored.get(key),
            put: async (_: string, key: string, value: unknown) => void stored.set(key, value),
            prune: async () => 0,
          },
        },
      ],
    });
    voice = TestBed.inject(CloudVoice);
  });
  afterEach(() => vi.unstubAllGlobals());

  const answer = (status: number) =>
    fetch.mockImplementation(
      async () => new Response(JSON.stringify({ audioContent: btoa('mp3') }), { status }),
    );

  it('is off without a key', () => {
    expect(voice.available).toBe(false);
    voice.configure({ provider: 'google', key: 'k', voice: 'Kore' });
    expect(voice.available).toBe(true);
  });

  it('asks for a sentence once', async () => {
    voice.configure({ provider: 'google', key: 'k', voice: 'Kore' });
    answer(200);
    await voice.say('Links abbiegen', 'de', 1);
    await voice.say('Links abbiegen', 'de', 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).not.toContain('k=');
    expect(JSON.parse(init.body).voice.name).toBe('de-DE-Chirp3-HD-Kore');
  });

  it('gives up on a refused key until it changes', async () => {
    voice.configure({ provider: 'google', key: 'bad', voice: 'Kore' });
    answer(403);
    await expect(voice.say('Hallo', 'de', 1)).rejects.toThrow();
    expect(voice.available).toBe(false);
    expect(voice.problem()).toBe('refused');
    voice.configure({ provider: 'google', key: 'good', voice: 'Kore' });
    expect(voice.available).toBe(true);
    expect(voice.problem()).toBeNull();
  });

  it('speaks with ElevenLabs and OpenAI without keeping the sound', async () => {
    fetchBinary.mockImplementation(async () => new Response('mp3'));
    voice.configure({ provider: 'elevenlabs', key: 'k', voice: 'v/1' });
    await voice.say('Links abbiegen', 'de', 2);
    const [url, init] = fetchBinary.mock.calls[0];
    expect(url).toContain('/v1/text-to-speech/v%2F1?');
    expect(init.headers['xi-api-key']).toBe('k');
    expect(JSON.parse(init.body)).toMatchObject({
      language_code: 'de',
      voice_settings: { speed: 1.2 },
    });
    voice.configure({ provider: 'openai', key: 'o', voice: 'marin' });
    await voice.say('Links abbiegen', 'de', 1);
    expect(fetchBinary.mock.calls[1][1].headers.authorization).toBe('Bearer o');
    expect(stored.size).toBe(0);
  });

  it('is off until an ElevenLabs voice is chosen', () => {
    voice.configure({ provider: 'elevenlabs', key: 'k', voice: '' });
    expect(voice.available).toBe(false);
  });

  it('recognises a used up quota behind a 401', async () => {
    fetchBinary.mockImplementation(
      async () => new Response('{"detail":{"status":"quota_exceeded"}}', { status: 401 }),
    );
    voice.configure({ provider: 'elevenlabs', key: 'k', voice: 'v' });
    await expect(voice.say('Hallo', 'de', 1)).rejects.toThrow();
    expect(voice.problem()).toBe('quota');
    expect(voice.available).toBe(false);
  });

  it('keeps trying after a fault of the server', async () => {
    answer(500);
    voice.configure({ provider: 'google', key: 'k', voice: 'Kore' });
    await expect(voice.say('Hallo', 'de', 1)).rejects.toThrow();
    expect(voice.available).toBe(true);
  });

  it('lists the natural Google voices of the language', async () => {
    fetch.mockImplementation(
      async () =>
        new Response(
          '{"voices":[{"name":"de-DE-Chirp3-HD-Zephyr"},{"name":"de-DE-Wavenet-A"},' +
            '{"name":"de-DE-Chirp3-HD-Kore"}]}',
        ),
    );
    expect(await voice.googleVoices('k', 'de')).toEqual(['Kore', 'Zephyr']);
    expect(fetch.mock.calls[0][0]).not.toContain('key=');
  });

  it('lists the voices of the ElevenLabs account', async () => {
    fetch.mockImplementation(
      async () =>
        new Response(
          '{"voices":[{"voice_id":"v1","name":"Anna","labels":{"language":"de"},' +
            '"verified_languages":[{"language":"de"},{"language":"en"}]},{"voice_id":"v2","name":"Eve"}]}',
        ),
    );
    expect(await voice.accountVoices('k')).toEqual([
      { id: 'v1', name: 'Anna', languages: ['de', 'en'] },
      { id: 'v2', name: 'Eve', languages: [] },
    ]);
  });
});
