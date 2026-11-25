import type { PluginListenerHandle } from '@capacitor/core';

export interface NativeAccessory {
  /** serial number, or the name where there is none */
  id: string;
  name: string;
  /** protocols of the accessory that the app declares in Info.plist */
  protocols: string[];
}

/** iOS and Android; accessories (MFi) on iOS only. Rejects on the web. */
export interface SerialNativePlugin {
  /** Resolves once connected. An older connection to the same target is closed. */
  connectTcp(options: { id: string; host: string; port: number; timeoutMs: number }): Promise<void>;
  listAccessories(): Promise<{ accessories: NativeAccessory[] }>;
  connectAccessory(options: { id: string; accessoryId: string; protocol: string }): Promise<void>;
  /** `data` is base64. */
  write(options: { id: string; data: string }): Promise<void>;
  /** Fires no `closed` event. */
  close(options: { id: string }): Promise<void>;
  addListener(
    event: 'data',
    listener: (event: { id: string; data: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'closed',
    listener: (event: { id: string }) => void,
  ): Promise<PluginListenerHandle>;
}

export declare const SerialNative: SerialNativePlugin;
