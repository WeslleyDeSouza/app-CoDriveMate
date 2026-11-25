import { Component, Type, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '@core/i18n/testing';
import { findHook, hook, textOf } from '@shared/testing';
import { MediaStore } from '../application/media.store';
import { embedUrl, parseYoutube } from '../domain/media';
import { mediaTesting } from '../testing';
import { EspSettings } from './esp-settings';
import { EspSetupPage } from './esp-setup-page';
import { MediaPage } from './media-page';
import { MusicBar } from './music-bar';
import { YoutubeSlot } from './youtube-slot';

const LIST = 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf';

@Component({
  imports: [YoutubeSlot],
  template: `@if (store.youtube(); as item) {
    <app-youtube-slot [item]="item" />
  }`,
})
class SlotHost {
  readonly store = inject(MediaStore);
}

describe('parseYoutube', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'video', 'dQw4w9WgXcQ'],
    ['youtu.be/dQw4w9WgXcQ?t=4', 'video', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/shorts/dQw4w9WgXcQ', 'video', 'dQw4w9WgXcQ'],
    [`https://music.youtube.com/playlist?list=${LIST}`, 'playlist', LIST],
    [`https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${LIST}`, 'playlist', LIST],
    [
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVMdQw4w9WgXcQ',
      'video',
      'dQw4w9WgXcQ',
    ],
    [LIST, 'playlist', LIST],
  ])('reads %s', (link, kind, id) => {
    expect(parseYoutube(link)).toEqual({ kind, id });
  });

  it.each([
    '',
    'hallo',
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/@kanal',
    'https://music.youtube.com/playlist?list=RDCLAK5uy_x',
  ])('rejects "%s"', (link) => expect(parseYoutube(link)).toBeNull());

  it('builds the address of the player', () => {
    expect(embedUrl({ kind: 'playlist', id: LIST })).toContain(
      `embed?listType=playlist&list=${LIST}&`,
    );
    expect(embedUrl({ kind: 'video', id: 'dQw4w9WgXcQ' })).toContain(
      '/embed/dQw4w9WgXcQ?playsinline=1',
    );
  });
});

describe('media', () => {
  let fixture: ComponentFixture<unknown>;
  let root: HTMLElement;
  let media: ReturnType<typeof mediaTesting>;
  let store: MediaStore;

  async function setup(component: Type<unknown>, before?: () => void): Promise<void> {
    media = mediaTesting();
    before?.();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideI18nTesting(), ...media.providers],
    });
    store = TestBed.inject(MediaStore);
    fixture = TestBed.createComponent(component);
    root = fixture.nativeElement;
    await settle();
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));
    }
    fixture.detectChanges();
  }

  async function press(name: string): Promise<void> {
    hook(root, name).click();
    await settle();
  }

  describe('page', () => {
    it('says where Apple Music works', async () => {
      await setup(MediaPage, () => (media.music.isAvailable = false));
      expect(findHook(root, 'media-music-unavailable')).not.toBeNull();
      expect(findHook(root, 'media-connect')).toBeNull();
    });

    it('asks for access only on tap and then shows the playlists', async () => {
      await setup(MediaPage, () => (media.music.lists = [{ id: '7', name: 'Auto', count: 12 }]));
      expect(store.state()).toBe('off');
      await press('media-connect');
      await press('media-playlist-7');
      expect(media.music.calls).toEqual(['play 7']);
    });

    it('connects by itself when access was given before', async () => {
      await setup(MediaPage, () => (media.music.before = true));
      expect(store.state()).toBe('on');
    });

    it('explains a refusal', async () => {
      await setup(MediaPage, () => (media.music.allowed = false));
      await press('media-connect');
      expect(findHook(root, 'media-denied')).not.toBeNull();
    });

    it('saves, plays and removes a link', async () => {
      await setup(MediaPage);
      hook<HTMLInputElement>(root, 'media-link').value =
        `https://music.youtube.com/playlist?list=${LIST}`;
      hook<HTMLInputElement>(root, 'media-name').value = ' Fahrt ';
      await press('media-add');
      expect(media.repository.items).toEqual([{ kind: 'playlist', id: LIST, title: 'Fahrt' }]);
      expect(hook<HTMLInputElement>(root, 'media-link').value).toBe('');

      await press('media-play-' + LIST);
      expect(store.youtube()?.id).toBe(LIST);

      await press('media-remove-' + LIST);
      expect(store.youtube()).toBeNull();
      expect(media.repository.items).toEqual([]);
    });

    it('sets up and removes the module', async () => {
      await setup(MediaPage);
      expect(findHook(root, 'media-remote-forget')).toBeNull();
      await press('media-remote-choose');
      expect(textOf(hook(root, 'media-remote-status'))).toBe('media.remote.pairing');
      await press('media-remote-forget');
      expect(textOf(hook(root, 'media-remote-status'))).toBe('media.remote.none');
    });

    it('rejects a link that cannot be played', async () => {
      await setup(MediaPage);
      hook<HTMLInputElement>(root, 'media-link').value = 'https://example.com';
      await press('media-add');
      expect(findHook(root, 'media-invalid')).not.toBeNull();
      expect(media.repository.items).toEqual([]);
    });
  });

  describe('ESP32 guide', () => {
    it('leads from the parts to a working module', async () => {
      await setup(EspSetupPage);
      expect(textOf(hook(root, 'esp-step'))).toBe('media.esp.parts.title');
      await press('esp-forward');
      expect(hook(root, 'esp-download').getAttribute('href')).toBe(
        'assets/firmware/media_remote.ino',
      );
      await press('esp-forward');
      await press('esp-forward');
      await press('esp-setup-choose');
      expect(textOf(hook(root, 'esp-setup-status'))).toBe('media.remote.pairing');
      media.remote.say(0, '1');
      await settle();
      expect(textOf(hook(root, 'esp-setup-status'))).toBe('media.remote.on');

      await press('esp-forward');
      expect(findHook(root, 'esp-waiting')).not.toBeNull();
      media.remote.say(2, 'Lied');
      await settle();
      expect(textOf(hook(root, 'esp-song'))).toContain('Lied');
      await press('esp-next');
      expect(media.remote.sent).toContain('next');

      await press('esp-back');
      expect(findHook(root, 'esp-setup-choose')).not.toBeNull();
    });

    it('is reached from the settings, where the module can be removed', async () => {
      await setup(EspSettings);
      expect(hook(root, 'esp-guide').getAttribute('href')).toBe('/esp');
      await press('esp-choose');
      expect(textOf(hook(root, 'esp-name'))).toBe('CoDriveMate Media');
      await press('esp-forget');
      expect(findHook(root, 'esp-name')).toBeNull();
    });
  });

  describe('bar', () => {
    it('appears with the music and controls it', async () => {
      await setup(MusicBar, () => (media.music.before = true));
      expect(findHook(root, 'music-bar')).toBeNull();
      media.music.emit({ title: 'Lied', artist: 'Band', artwork: '', playing: true });
      await settle();
      expect(textOf(hook(root, 'music-title'))).toBe('Lied');
      await press('music-previous');
      await press('music-toggle');
      await press('music-next');
      expect(media.music.calls).toEqual(['previous', 'toggle', 'next']);
    });
  });

  describe('YouTube player', () => {
    const item = { kind: 'video', id: 'dQw4w9WgXcQ', title: 'Video' } as const;

    it('opens, pauses the music and closes', async () => {
      await setup(SlotHost, () => (media.music.before = true));
      media.music.emit({ title: 'Lied', artist: '', artwork: '', playing: true });
      store.playYoutube(item);
      await settle();
      expect(media.youtube.open_).toBe(1);
      expect(media.music.calls).toEqual(['toggle']);

      await press('youtube-close');
      expect(media.youtube.open_).toBe(0);
    });

    it('gives way to a playlist of the music app', async () => {
      await setup(SlotHost);
      store.playYoutube(item);
      await settle();
      store.playPlaylist('7');
      await settle();
      expect(media.youtube.open_).toBe(0);
    });

    it('says when it cannot be opened', async () => {
      await setup(SlotHost, () => (media.youtube.failure = new Error('x')));
      store.playYoutube(item);
      await settle();
      expect(findHook(root, 'youtube-failed')).not.toBeNull();
    });
  });
});
