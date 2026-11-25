import { TestBed } from '@angular/core/testing';
import { HttpPort } from '@core/http';
import { RealtimeRefusedError, RealtimeVoice } from './realtime-voice';
import { saysTheSame } from './verbatim';

describe('saysTheSame', () => {
  const text = 'In 300 Metern rechts abbiegen auf die Bahnhofstrasse.';

  it('accepts the text with other punctuation, spelling or numbers as words', () => {
    expect(saysTheSame(text, 'in 300 Metern, rechts abbiegen auf die Bahnhofstraße')).toBe(true);
    expect(saysTheSame(text, 'In dreihundert Metern rechts abbiegen auf die Bahnhofstrasse.')).toBe(
      true,
    );
  });

  it('rejects another direction or number', () => {
    expect(saysTheSame(text, text.replace('rechts', 'links'))).toBe(false);
    expect(saysTheSame(text, text.replace('300', '800'))).toBe(false);
  });

  it('rejects answers, additions and gaps', () => {
    expect(saysTheSame('Soll ich die Route starten?', 'Ja, gerne starte ich sie.')).toBe(false);
    expect(saysTheSame('Gute Fahrt!', 'Gute Fahrt! Kann ich sonst noch etwas tun?')).toBe(false);
    expect(saysTheSame(text, 'Rechts abbiegen.')).toBe(false);
    expect(saysTheSame(text, '')).toBe(false);
  });
});

describe('RealtimeVoice', () => {
  class FakeSocket {
    static all: FakeSocket[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    sent: string[] = [];
    closed = false;
    constructor(
      readonly url: string,
      readonly protocols: string[],
    ) {
      FakeSocket.all.push(this);
    }
    send(data: string) {
      this.sent.push(data);
    }
    close() {
      this.closed = true;
    }
    emit(event: unknown) {
      this.onmessage?.({ data: JSON.stringify(event) });
    }
  }

  const fetch = vi.fn();
  const request = { key: 'sk-secret', voice: 'nova', text: 'Links abbiegen', lang: 'de', rate: 2 };
  let voice: RealtimeVoice;

  beforeEach(() => {
    FakeSocket.all = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    fetch.mockReset();
    fetch.mockImplementation(async () => new Response('{"value":"ek_1"}'));
    TestBed.configureTestingModule({ providers: [{ provide: HttpPort, useValue: { fetch } }] });
    voice = TestBed.inject(RealtimeVoice);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function open(signal = new AbortController().signal) {
    const result = voice.synthesize(request, signal);
    // Handled by each test; must not count as unhandled before that.
    result.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve));
    const socket = FakeSocket.all[FakeSocket.all.length - 1];
    socket?.onopen?.();
    return { result, socket };
  }

  function speak(socket: FakeSocket, transcript: string) {
    socket.emit({ type: 'response.output_audio.delta', delta: btoa('abcd') });
    socket.emit({ type: 'response.output_audio_transcript.done', transcript });
    socket.emit({ type: 'response.done', response: { status: 'completed' } });
  }

  it('reads the text with a short-lived key', async () => {
    const { result, socket } = await open();
    expect(socket.protocols).toEqual(['realtime', 'openai-insecure-api-key.ek_1']);
    expect(JSON.stringify(socket)).not.toContain('sk-secret');
    expect(socket.sent[0]).toContain('<read>Links abbiegen</read>');
    speak(socket, 'Links abbiegen.');
    const blob = await result;
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(48);
    expect(socket.closed).toBe(true);
    const { output } = JSON.parse(fetch.mock.calls[0][1].body).session.audio;
    expect(output).toMatchObject({ voice: 'marin', speed: 1.5 });
  });

  it('uses the short-lived key again', async () => {
    const first = await open();
    speak(first.socket, 'Links abbiegen');
    await first.result;
    const second = await open();
    speak(second.socket, 'Links abbiegen');
    await second.result;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('plays nothing that differs from the text', async () => {
    const { result, socket } = await open();
    speak(socket, 'Rechts abbiegen');
    await expect(result).rejects.toThrow('as it is');
  });

  it('reports a refused key', async () => {
    fetch.mockImplementation(async () => new Response('no', { status: 401 }));
    const { result } = await open();
    await expect(result).rejects.toBeInstanceOf(RealtimeRefusedError);
    expect(FakeSocket.all).toHaveLength(0);
  });

  it('reports an unfinished answer', async () => {
    const { result, socket } = await open();
    socket.emit({
      type: 'response.done',
      response: { status: 'failed', status_details: { error: { code: 'insufficient_quota' } } },
    });
    await expect(result).rejects.toMatchObject({ body: 'insufficient_quota' });
  });

  it('closes the connection when stopped, and fetches a new key after a loss', async () => {
    const controller = new AbortController();
    const { result, socket } = await open(controller.signal);
    controller.abort();
    await expect(result).rejects.toThrow('stopped');
    expect(socket.closed).toBe(true);
    const lost = await open();
    lost.socket.onclose?.();
    await expect(lost.result).rejects.toThrow('lost');
    await open();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
