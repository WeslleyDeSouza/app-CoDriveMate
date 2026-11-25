import { Injectable, computed, inject, signal } from '@angular/core';
import {
  MediaRepository,
  MusicPlayer,
  MusicPlaylist,
  NowPlaying,
  YoutubeItem,
  parseYoutube,
} from '../domain/media';

import { RemoteStore } from './remote.store';

export type MusicState = 'unavailable' | 'off' | 'connecting' | 'on' | 'denied';

/** Music while driving, without leaving the app. */
@Injectable({ providedIn: 'root' })
export class MediaStore {
  private readonly music = inject(MusicPlayer);
  private readonly repository = inject(MediaRepository);
  private readonly remote = inject(RemoteStore);

  private readonly _state = signal<MusicState>(this.music.available() ? 'off' : 'unavailable');
  private readonly musicApp = signal<NowPlaying | null>(null);
  private readonly _playlists = signal<readonly MusicPlaylist[]>([]);
  private readonly _items = signal<readonly YoutubeItem[]>([]);
  private readonly _youtube = signal<YoutubeItem | null>(null);
  private readonly loaded: Promise<void>;

  readonly state = this._state.asReadonly();
  /** The module knows what any app plays; the music app adds the cover. */
  readonly nowPlaying = computed(() => {
    const any = this.remote.nowPlaying();
    const own = this.musicApp();
    if (!any) return own;
    return own && own.title === any.title ? { ...own, playing: any.playing } : any;
  });
  readonly playlists = this._playlists.asReadonly();
  readonly items = this._items.asReadonly();
  /** The YouTube item being shown. */
  readonly youtube = this._youtube.asReadonly();

  constructor() {
    this.loaded = this.repository
      .load()
      .then((items) => this._items.set(items))
      .catch((error: unknown) => console.warn('Loading media failed', error));
    if (this.music.available()) {
      void this.music
        .granted()
        .then((granted) => (granted ? this.connect() : undefined))
        .catch(() => undefined);
    }
  }

  async connect(): Promise<void> {
    const state = this._state();
    if (state === 'unavailable' || state === 'connecting' || state === 'on') return;
    this._state.set('connecting');
    try {
      if (!(await this.music.connect())) {
        this._state.set('denied');
        return;
      }
      await this.music.watch((playing) => this.musicApp.set(playing));
      this._state.set('on');
      this._playlists.set(await this.music.playlists());
    } catch (error) {
      console.warn('Connecting to the music app failed', error);
      if (this._state() === 'connecting') this._state.set('off');
    }
  }

  toggle(): void {
    this.control('toggle');
  }

  next(): void {
    this.control('next');
  }

  previous(): void {
    this.control('previous');
  }

  playPlaylist(id: string): void {
    this._youtube.set(null); // two sources at once would play over each other
    this.run(this.music.play(id));
  }

  /** Saves a link. False if it is none that can be played. */
  async add(link: string, title: string): Promise<boolean> {
    const parsed = parseYoutube(link);
    if (!parsed) return false;
    await this.loaded;
    const item: YoutubeItem = { ...parsed, title: title.trim() || parsed.id };
    await this.setItems([...this._items().filter((other) => other.id !== item.id), item]);
    return true;
  }

  async remove(id: string): Promise<void> {
    await this.loaded;
    if (this._youtube()?.id === id) this._youtube.set(null);
    await this.setItems(this._items().filter((item) => item.id !== id));
  }

  playYoutube(item: YoutubeItem): void {
    if (this.nowPlaying()?.playing) this.toggle();
    this._youtube.set(item);
  }

  closeYoutube(): void {
    this._youtube.set(null);
  }

  private async setItems(items: readonly YoutubeItem[]): Promise<void> {
    this._items.set(items);
    await this.repository.save(items);
  }

  private control(action: 'toggle' | 'next' | 'previous'): void {
    this.run(this.remote.nowPlaying() ? this.remote.send(action) : this.music[action]());
  }

  private run(action: Promise<void>): void {
    action.catch((error: unknown) => console.warn('Music control failed', error));
  }
}
