import { TestBed } from '@angular/core/testing';
import { EMPTY_REMOTE, applyRemoteMessage } from '../domain/media-remote';
import { mediaTesting } from '../testing';
import { MediaStore } from './media.store';
import { RemoteStore } from './remote.store';

describe('module messages', () => {
  it('are applied one by one', () => {
    const message = (kind: number, text: string) =>
      Uint8Array.of(kind, ...new TextEncoder().encode(text));
    let state = EMPTY_REMOTE;
    for (const [kind, text] of [
      [0, '1'],
      [1, 'YouTube Music'],
      [2, 'Über den Wolken'],
      [3, 'Band'],
      [4, '1'],
      [9, 'later version'],
    ] as const) {
      state = applyRemoteMessage(state, message(kind, text));
    }
    expect(state).toEqual({
      ready: true,
      app: 'YouTube Music',
      title: 'Über den Wolken',
      artist: 'Band',
      playing: true,
    });
    expect(applyRemoteMessage(state, new Uint8Array())).toBe(state);
  });
});

describe('RemoteStore', () => {
  let media: ReturnType<typeof mediaTesting>;
  let remote: RemoteStore;
  let store: MediaStore;

  async function setup(known = false): Promise<void> {
    vi.useFakeTimers();
    media = mediaTesting();
    if (known) media.remote.stored = { id: 'm1', name: 'CoDriveMate Media' };
    TestBed.configureTestingModule({ providers: media.providers });
    store = TestBed.inject(MediaStore);
    remote = TestBed.inject(RemoteStore);
    await vi.advanceTimersByTimeAsync(10);
  }

  afterEach(() => vi.useRealTimers());

  function play(title = 'Lied'): void {
    media.remote.say(0, '1');
    media.remote.say(1, 'YouTube Music');
    media.remote.say(2, title);
    media.remote.say(4, '1');
  }

  it('is set up with one tap and waits for the pairing', async () => {
    await setup();
    expect(remote.status()).toBe('none');
    await remote.choose();
    await vi.advanceTimersByTimeAsync(10);
    expect(remote.status()).toBe('pairing');
    expect(media.remote.sent).toEqual(['sendState']);
    play();
    expect(remote.status()).toBe('on');
    expect(store.nowPlaying()).toMatchObject({ title: 'Lied', artist: 'YouTube Music' });
  });

  it('connects by itself the next time', async () => {
    await setup(true);
    expect(remote.status()).toBe('pairing');
  });

  it('sends the controls to the module while it reports music', async () => {
    await setup(true);
    play();
    store.toggle();
    store.next();
    store.previous();
    expect(media.remote.sent.slice(1)).toEqual(['toggle', 'next', 'previous']);
    expect(media.music.calls).toEqual([]);
  });

  it('keeps the cover when the music app plays the same song', async () => {
    await setup(true);
    await store.connect();
    media.music.emit({ title: 'Lied', artist: 'Band', artwork: 'data:x', playing: true });
    play('Lied');
    expect(store.nowPlaying()?.artwork).toBe('data:x');
    media.remote.say(2, 'Anderes');
    expect(store.nowPlaying()?.artwork).toBe('');
  });

  it('goes back to the music app without the module', async () => {
    await setup();
    await store.connect();
    media.music.emit({ title: 'Lied', artist: 'Band', artwork: '', playing: true });
    store.next();
    expect(media.music.calls).toEqual(['next']);
  });

  it('reconnects after a drop, until it is forgotten', async () => {
    await setup(true);
    play();
    media.remote.drop();
    expect(remote.status()).toBe('connecting');
    expect(store.nowPlaying()).toBeNull();
    await vi.advanceTimersByTimeAsync(2100);
    expect(media.remote.opened).toBe(2);

    await remote.forget();
    expect(remote.status()).toBe('none');
    expect(media.remote.stored).toBeNull();
    await vi.advanceTimersByTimeAsync(60000);
    expect(media.remote.opened).toBe(2);
  });

  it('reports a failure, but not a closed picker', async () => {
    await setup();
    media.remote.chooseError = new Error('User cancelled');
    await remote.choose();
    expect(remote.status()).toBe('none');
    media.remote.chooseError = new Error('broken');
    await remote.choose();
    expect(remote.status()).toBe('failed');
  });
});
