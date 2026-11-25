export interface YoutubeItem {
  readonly kind: 'video' | 'playlist';
  readonly id: string;
  readonly title: string;
}

const VIDEO_ID = /^[\w-]{11}$/;
/** Playlists, albums and uploads can be embedded; personal mixes (RD…) cannot. */
const PLAYLIST_ID = /^(PL|OLAK5uy_|UU|FL)[\w-]{8,}$/;

/** Reads a YouTube or YouTube Music link, or a bare id. Null if it is neither. */
export function parseYoutube(text: string): Pick<YoutubeItem, 'kind' | 'id'> | null {
  const input = text.trim();
  if (PLAYLIST_ID.test(input)) return { kind: 'playlist', id: input };
  if (VIDEO_ID.test(input)) return { kind: 'video', id: input };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : 'https://' + input);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be') return null;
  const list = url.searchParams.get('list') ?? '';
  if (PLAYLIST_ID.test(list)) return { kind: 'playlist', id: list };
  const segments = url.pathname.split('/').filter(Boolean);
  const video =
    url.searchParams.get('v') ??
    (host === 'youtu.be'
      ? segments[0]
      : /^(shorts|live|embed)$/.test(segments[0])
        ? segments[1]
        : '');
  return VIDEO_ID.test(video ?? '') ? { kind: 'video', id: video } : null;
}

/** Address of the embedded player. */
export function embedUrl({ kind, id }: Pick<YoutubeItem, 'kind' | 'id'>): string {
  const path = kind === 'playlist' ? `?listType=playlist&list=${id}&` : `/${id}?`;
  return `https://www.youtube.com/embed${path}playsinline=1&rel=0`;
}

export interface NowPlaying {
  readonly title: string;
  readonly artist: string;
  /** data URL, '' if there is none */
  readonly artwork: string;
  readonly playing: boolean;
}

export interface MusicPlaylist {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}

/** Port: the music app of the device. */
export abstract class MusicPlayer {
  /** False where the music app cannot be controlled, e.g. in the browser. */
  abstract available(): boolean;
  /** True if access was granted before; does not ask. */
  abstract granted(): Promise<boolean>;
  /** Asks for access. */
  abstract connect(): Promise<boolean>;
  /** Reports what is playing, now and on every change. */
  abstract watch(onChange: (playing: NowPlaying | null) => void): Promise<void>;
  abstract toggle(): Promise<void>;
  abstract next(): Promise<void>;
  abstract previous(): Promise<void>;
  abstract playlists(): Promise<MusicPlaylist[]>;
  abstract play(playlistId: string): Promise<void>;
}

/** Port: a visible YouTube player filling a container. */
export abstract class YoutubePlayer {
  /** Resolves with a function that closes it. */
  abstract open(container: HTMLElement, item: YoutubeItem): Promise<() => void>;
}

/** Port: the saved YouTube links. */
export abstract class MediaRepository {
  abstract load(): Promise<YoutubeItem[]>;
  abstract save(items: readonly YoutubeItem[]): Promise<void>;
}
