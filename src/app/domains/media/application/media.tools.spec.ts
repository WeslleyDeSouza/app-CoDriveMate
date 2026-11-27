import { TestBed } from '@angular/core/testing';
import { AssistantTool } from '@core/assistant';
import { mediaTesting } from '../testing';
import { MediaStore } from './media.store';
import { musicTool } from './media.tools';

describe('play_music', () => {
  let media: ReturnType<typeof mediaTesting>;
  let tool: AssistantTool;
  const context = { confirm: async () => true };
  const song = { title: 'Lied', artist: 'Band', artwork: '' };

  async function setup(before?: () => void): Promise<void> {
    media = mediaTesting();
    media.music.before = true;
    before?.();
    TestBed.configureTestingModule({ providers: media.providers });
    tool = TestBed.runInInjectionContext(musicTool);
    for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve));
  }

  const run = (input: Record<string, unknown> = {}) => tool.run(input, context);

  it('starts the music, and leaves it alone when it plays already', async () => {
    await setup();
    expect(await run()).toBe('Music playback started.');
    expect(media.music.calls).toEqual(['toggle']);

    media.music.emit({ ...song, playing: true });
    expect(await run({ action: 'play' })).toBe('Music is already playing.');
    expect(media.music.calls).toEqual(['toggle']);
  });

  it('pauses only what plays', async () => {
    await setup();
    media.music.emit({ ...song, playing: false });
    expect(await run({ action: 'pause' })).toBe('No music is playing.');
    expect(media.music.calls).toEqual([]);

    media.music.emit({ ...song, playing: true });
    expect(await run({ action: 'pause' })).toBe('Music paused.');
    expect(media.music.calls).toEqual(['toggle']);
  });

  it('skips to the next track', async () => {
    await setup();
    expect(await run({ action: 'next' })).toBe('Skipped to the next track.');
    expect(media.music.calls).toEqual(['next']);
  });

  it('does not play over the YouTube player', async () => {
    await setup();
    TestBed.inject(MediaStore).playYoutube({ kind: 'video', id: 'dQw4w9WgXcQ', title: 'Video' });
    expect(await run()).toContain('YouTube player is open');
    expect(media.music.calls).toEqual([]);
  });

  it('says where music cannot be controlled', async () => {
    await setup(() => (media.music.isAvailable = false));
    expect(await run()).toBe('Music cannot be controlled on this device.');
    expect(media.music.calls).toEqual([]);
  });

  it('says when access to the music app is missing', async () => {
    await setup(() => (media.music.before = false));
    expect(await run({ action: 'next' })).toContain('not connected yet');
    expect(media.music.calls).toEqual([]);
  });

  it('rejects an unknown action and names no song', async () => {
    await setup();
    media.music.emit({ ...song, playing: true });
    expect(await run({ action: 'louder' })).toBe('Unknown action. Known: play, pause, next.');
    for (const action of ['play', 'pause', 'next']) {
      expect(await run({ action })).not.toMatch(/Lied|Band/);
    }
  });
});
