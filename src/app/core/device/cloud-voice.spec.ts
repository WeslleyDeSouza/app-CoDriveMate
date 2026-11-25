import { TestBed } from '@angular/core/testing';
import { HttpPort } from '@core/http';
import { CacheStore } from '@core/storage';
import { CloudVoice } from './cloud-voice';

describe('CloudVoice', () => {
  const fetch = vi.fn();
  const stored = new Map<string, unknown>();
  let voice: CloudVoice;

  beforeEach(() => {
    fetch.mockReset();
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
        { provide: HttpPort, useValue: { fetch } },
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
    voice.configure({ key: 'k', voice: 'Kore' });
    expect(voice.available).toBe(true);
  });

  it('asks for a sentence once', async () => {
    voice.configure({ key: 'k', voice: 'Kore' });
    answer(200);
    await voice.say('Links abbiegen', 'de', 1);
    await voice.say('Links abbiegen', 'de', 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).not.toContain('k=');
    expect(JSON.parse(init.body).voice.name).toBe('de-DE-Chirp3-HD-Kore');
  });

  it('gives up on a refused key until it changes', async () => {
    voice.configure({ key: 'bad', voice: 'Kore' });
    answer(403);
    await expect(voice.say('Hallo', 'de', 1)).rejects.toThrow();
    expect(voice.available).toBe(false);
    expect(voice.problem()).toBe('refused');
    voice.configure({ key: 'good', voice: 'Kore' });
    expect(voice.available).toBe(true);
    expect(voice.problem()).toBeNull();
  });
});
