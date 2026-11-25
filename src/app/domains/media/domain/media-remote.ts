import { NowPlaying } from './media';

/** Commands of the Apple Media Service, passed through by the module. */
export const REMOTE_COMMAND = { toggle: 2, next: 3, previous: 4, sendState: 0xff } as const;
export type RemoteCommand = keyof typeof REMOTE_COMMAND;

/** What the module reports about the app playing on the iPad. */
export interface RemoteState {
  /** iOS lets the module in (paired). */
  readonly ready: boolean;
  readonly app: string;
  readonly title: string;
  readonly artist: string;
  readonly playing: boolean;
}

export const EMPTY_REMOTE: RemoteState = {
  ready: false,
  app: '',
  title: '',
  artist: '',
  playing: false,
};

/** Applies one message of the module: a kind byte, then the value as UTF-8. */
export function applyRemoteMessage(state: RemoteState, message: Uint8Array): RemoteState {
  if (!message.length) return state;
  const value = new TextDecoder().decode(message.subarray(1));
  switch (message[0]) {
    case 0:
      return { ...state, ready: value === '1' };
    case 1:
      return { ...state, app: value };
    case 2:
      return { ...state, title: value };
    case 3:
      return { ...state, artist: value };
    case 4:
      return { ...state, playing: value === '1' };
    default:
      return state;
  }
}

export function remoteNowPlaying(state: RemoteState): NowPlaying | null {
  if (!state.ready || !state.title) return null;
  return {
    title: state.title,
    artist: [state.artist, state.app].filter(Boolean).join(' · '),
    artwork: '',
    playing: state.playing,
  };
}

export interface RemoteDevice {
  readonly id: string;
  readonly name: string;
}

export interface RemoteConnection {
  send(command: RemoteCommand): Promise<void>;
  close(): Promise<void>;
}

/** Port: the ESP32 module. */
export abstract class MediaRemote {
  /** The module chosen earlier. */
  abstract known(): Promise<RemoteDevice | null>;
  /** Lets the user pick the module and remembers it. Needs a tap. */
  abstract choose(): Promise<RemoteDevice>;
  abstract forget(): Promise<void>;
  abstract open(
    device: RemoteDevice,
    onMessage: (message: Uint8Array) => void,
    onClose: () => void,
  ): Promise<RemoteConnection>;
}

/** Seconds until the next attempt to reach the module. */
export function remoteRetryS(attempt: number): number {
  return [2, 5, 10, 30][Math.min(attempt, 3)];
}
