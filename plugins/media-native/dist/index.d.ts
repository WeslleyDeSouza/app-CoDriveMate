import type { PluginListenerHandle } from '@capacitor/core';

export interface NativeSong {
  title: string;
  artist: string;
  /** data URL or '' */
  artwork: string;
  playing: boolean;
}

export interface NativeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** iOS only. */
export interface MediaNativePlugin {
  /** Whether access was granted; does not ask. */
  musicStatus(): Promise<{ granted: boolean }>;
  musicConnect(): Promise<{ granted: boolean }>;
  musicNowPlaying(): Promise<{ item: NativeSong | null }>;
  musicToggle(): Promise<void>;
  musicNext(): Promise<void>;
  musicPrevious(): Promise<void>;
  musicPlaylists(): Promise<{ playlists: { id: string; name: string; count: number }[] }>;
  musicPlay(options: { id: string }): Promise<void>;
  youtubeShow(options: { url: string; frame: NativeRect }): Promise<void>;
  youtubeFrame(options: { frame: NativeRect }): Promise<void>;
  youtubeHide(): Promise<void>;
  addListener(
    event: 'musicChanged',
    listener: (event: { item: NativeSong | null }) => void,
  ): Promise<PluginListenerHandle>;
}

export declare const MediaNative: MediaNativePlugin;
