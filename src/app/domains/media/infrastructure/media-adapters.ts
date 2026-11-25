import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { MediaNative } from '@codrivemate/media-native';
import { KeyValueStore, LegacyMigration } from '@core/storage';
import {
  MediaRepository,
  MusicPlayer,
  MusicPlaylist,
  NowPlaying,
  YoutubeItem,
  YoutubePlayer,
  embedUrl,
  parseYoutube,
} from '../domain/media';

const isIos = () => Capacitor.getPlatform() === 'ios';

/** The Apple Music app on iPad and iPhone, through MediaPlayer. */
@Injectable()
export class AppleMusicPlayer extends MusicPlayer {
  available(): boolean {
    return isIos();
  }
  async granted(): Promise<boolean> {
    return (await MediaNative.musicStatus()).granted;
  }
  async connect(): Promise<boolean> {
    return (await MediaNative.musicConnect()).granted;
  }
  async watch(onChange: (playing: NowPlaying | null) => void): Promise<void> {
    const apply = ({ item }: { item: NowPlaying | null }) => onChange(item ?? null);
    await MediaNative.addListener('musicChanged', apply);
    apply(await MediaNative.musicNowPlaying());
  }
  toggle(): Promise<void> {
    return MediaNative.musicToggle();
  }
  next(): Promise<void> {
    return MediaNative.musicNext();
  }
  previous(): Promise<void> {
    return MediaNative.musicPrevious();
  }
  async playlists(): Promise<MusicPlaylist[]> {
    return (await MediaNative.musicPlaylists()).playlists;
  }
  play(id: string): Promise<void> {
    return MediaNative.musicPlay({ id });
  }
}

/**
 * YouTube's own player. In the iOS app it is a native web view on top, because
 * YouTube needs the app's identity as referrer, which the app's page cannot send.
 */
@Injectable()
export class EmbeddedYoutubePlayer extends YoutubePlayer {
  async open(container: HTMLElement, item: YoutubeItem): Promise<() => void> {
    return isIos() ? openNative(container, item) : openFrame(container, item);
  }
}

function openFrame(container: HTMLElement, item: YoutubeItem): () => void {
  const frame = document.createElement('iframe');
  frame.src = embedUrl(item);
  frame.title = item.title;
  frame.allow = 'autoplay; encrypted-media; picture-in-picture';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allowFullscreen = true;
  container.replaceChildren(frame);
  return () => frame.remove();
}

async function openNative(container: HTMLElement, item: YoutubeItem): Promise<() => void> {
  const frame = () => {
    const { left, top, width, height } = container.getBoundingClientRect();
    return { x: left, y: top, width, height };
  };
  await MediaNative.youtubeShow({ url: embedUrl(item), frame: frame() });
  const observer = new ResizeObserver(
    () => void MediaNative.youtubeFrame({ frame: frame() }).catch(() => undefined),
  );
  observer.observe(container);
  return () => {
    observer.disconnect();
    void MediaNative.youtubeHide().catch(() => undefined);
  };
}

const ITEMS_KEY = 'media/youtube';

@Injectable()
export class IdbMediaRepository extends MediaRepository {
  private readonly kv = inject(KeyValueStore);

  async load(): Promise<YoutubeItem[]> {
    return (await this.kv.get<YoutubeItem[]>(ITEMS_KEY)) ?? [];
  }

  save(items: readonly YoutubeItem[]): Promise<void> {
    return this.kv.set(ITEMS_KEY, items);
  }
}

/** Imports the playlist of the prototype (`pd_yt`). */
export const mediaLegacyMigration: LegacyMigration = {
  id: 'media-v1',
  async migrate({ source, kv }) {
    const parsed = parseYoutube(source.localRaw('pd_yt') ?? '');
    if (!parsed || (await kv.get(ITEMS_KEY)) !== undefined) return;
    await kv.set(ITEMS_KEY, [{ ...parsed, title: 'YouTube' }]);
  },
};
