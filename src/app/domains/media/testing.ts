import { Provider } from '@angular/core';
import { MediaRemote, RemoteCommand, RemoteConnection, RemoteDevice } from './domain/media-remote';
import {
  MediaRepository,
  MusicPlayer,
  MusicPlaylist,
  NowPlaying,
  YoutubeItem,
  YoutubePlayer,
} from './domain/media';

export class FakeMusicPlayer extends MusicPlayer {
  isAvailable = true;
  allowed = true;
  before = false;
  lists: MusicPlaylist[] = [];
  readonly calls: string[] = [];
  emit: (playing: NowPlaying | null) => void = () => undefined;

  available(): boolean {
    return this.isAvailable;
  }
  async granted(): Promise<boolean> {
    return this.before;
  }
  async connect(): Promise<boolean> {
    return this.allowed;
  }
  async watch(onChange: (playing: NowPlaying | null) => void): Promise<void> {
    this.emit = onChange;
  }
  async toggle(): Promise<void> {
    this.calls.push('toggle');
  }
  async next(): Promise<void> {
    this.calls.push('next');
  }
  async previous(): Promise<void> {
    this.calls.push('previous');
  }
  async playlists(): Promise<MusicPlaylist[]> {
    return this.lists;
  }
  async play(id: string): Promise<void> {
    this.calls.push('play ' + id);
  }
}

export class FakeYoutubePlayer extends YoutubePlayer {
  open_ = 0;
  failure?: Error;
  async open(): Promise<() => void> {
    if (this.failure) throw this.failure;
    this.open_++;
    return () => this.open_--;
  }
}

export class FakeMediaRepository extends MediaRepository {
  items: readonly YoutubeItem[] = [];
  async load(): Promise<YoutubeItem[]> {
    return [...this.items];
  }
  async save(items: readonly YoutubeItem[]): Promise<void> {
    this.items = items;
  }
}

export class FakeMediaRemote extends MediaRemote {
  stored: RemoteDevice | null = null;
  chooseError?: Error;
  opened = 0;
  readonly sent: RemoteCommand[] = [];
  drop: () => void = () => undefined;
  private message: (message: Uint8Array) => void = () => undefined;

  async known(): Promise<RemoteDevice | null> {
    return this.stored;
  }
  async choose(): Promise<RemoteDevice> {
    if (this.chooseError) throw this.chooseError;
    return (this.stored = { id: 'm1', name: 'CoDriveMate Media' });
  }
  async forget(): Promise<void> {
    this.stored = null;
  }
  async open(
    _device: RemoteDevice,
    onMessage: (message: Uint8Array) => void,
    onClose: () => void,
  ): Promise<RemoteConnection> {
    this.opened++;
    this.message = onMessage;
    this.drop = onClose;
    return {
      send: async (command) => void this.sent.push(command),
      close: async () => undefined,
    };
  }
  say(kind: number, text: string): void {
    this.message(Uint8Array.of(kind, ...new TextEncoder().encode(text)));
  }
}

export function mediaTesting() {
  const fakes = {
    music: new FakeMusicPlayer(),
    remote: new FakeMediaRemote(),
    youtube: new FakeYoutubePlayer(),
    repository: new FakeMediaRepository(),
  };
  const providers: Provider[] = [
    { provide: MusicPlayer, useValue: fakes.music },
    { provide: MediaRemote, useValue: fakes.remote },
    { provide: YoutubePlayer, useValue: fakes.youtube },
    { provide: MediaRepository, useValue: fakes.repository },
  ];
  return { ...fakes, providers };
}
