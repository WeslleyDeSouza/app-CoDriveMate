import { SpeechQueue } from './speech';

describe('SpeechQueue', () => {
  let said: string[];
  let finish: (() => void)[];
  let silenced: number;
  let queue: SpeechQueue;

  beforeEach(() => {
    said = [];
    finish = [];
    silenced = 0;
    queue = new SpeechQueue({
      say: (text) => {
        said.push(text);
        return new Promise((resolve) => finish.push(resolve));
      },
      silence: async () => {
        silenced++;
      },
    });
  });

  const tick = () => new Promise((resolve) => setTimeout(resolve));
  const speak = (text: string, kind: 'route' | 'nav' | 'answer' | 'talk') =>
    queue.speak(text, 'de', 1, kind);

  it('interrupts the conversation for a turn prompt', async () => {
    const talk = speak('chat', 'talk');
    void speak('turn left', 'route');
    expect(await talk).toBe(false);
    await tick();
    expect(said).toEqual(['chat', 'turn left']);
  });

  it('leaves turn prompts out while the conversation speaks first', async () => {
    queue.talkFirst = true;
    const talk = speak('chat', 'talk');
    expect(await speak('turn left', 'route')).toBe(false);
    expect(silenced).toBe(0);
    void speak('hazard', 'nav');
    expect(await talk).toBe(false);
    await tick();
    expect(said).toEqual(['chat', 'hazard']);
  });

  it('still says turn prompts with the conversation first when it is silent', async () => {
    queue.talkFirst = true;
    void speak('turn left', 'route');
    expect(said).toEqual(['turn left']);
  });

  it('lets announcements follow each other', async () => {
    const first = speak('a', 'nav');
    void speak('b', 'nav');
    expect(said).toEqual(['a']);
    finish[0]();
    expect(await first).toBe(true);
    await tick();
    expect(said).toEqual(['a', 'b']);
    finish[1]();
    await tick();
    expect(queue.busy()).toBe(false);
  });

  it('interrupts the conversation for an announcement', async () => {
    const talk = speak('chat', 'talk');
    void speak('turn left', 'nav');
    expect(await talk).toBe(false);
    await tick();
    expect(silenced).toBe(1);
    expect(said).toEqual(['chat', 'turn left']);
    expect(queue.busy()).toBe(true);
  });

  it('lets the conversation wait behind an announcement', async () => {
    void speak('turn left', 'nav');
    void speak('chat', 'talk');
    expect(silenced).toBe(0);
    finish[0]();
    await tick();
    expect(said).toEqual(['turn left', 'chat']);
  });

  it('goes on after a voice that never ends', async () => {
    vi.useFakeTimers();
    const stuck = speak('a', 'nav');
    void speak('b', 'nav');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await stuck).toBe(false);
    expect(silenced).toBe(1);
    expect(said).toEqual(['a', 'b']);
    vi.useRealTimers();
  });

  it('stops one kind only', async () => {
    void speak('turn left', 'nav');
    const talk = speak('chat', 'talk');
    await queue.stop('talk');
    expect(await talk).toBe(false);
    expect(silenced).toBe(0);
    await queue.stop();
    expect(queue.busy()).toBe(false);
  });
});
