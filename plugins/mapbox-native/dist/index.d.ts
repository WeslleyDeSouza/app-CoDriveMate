import type { PluginListenerHandle } from '@capacitor/core';

export interface NativeFrame {
  /** CSS pixels, relative to the web view */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NativeCamera {
  center: readonly [lon: number, lat: number];
  zoom: number;
  bearing: number;
  pitch: number;
}

/** Which of the open maps is meant. */
export interface NativeMapRef {
  mapId: string;
}

/**
 * Native maps behind the web view. Sources and layers are passed as JSON in
 * the Mapbox style specification. There is no web implementation.
 */
export interface MapboxNativePlugin {
  /** Resolves when the style is loaded, rejects if it cannot be. */
  create(options: {
    mapId: string;
    token: string;
    style: string;
    frame: NativeFrame;
    camera: NativeCamera;
  }): Promise<void>;
  destroy(options: NativeMapRef): Promise<void>;
  setFrame(options: NativeMapRef & { frame: NativeFrame }): Promise<void>;
  setCamera(options: NativeMapRef & { camera: NativeCamera; durationMs: number }): Promise<void>;
  addSource(options: NativeMapRef & { id: string; source: string }): Promise<void>;
  setData(options: NativeMapRef & { id: string; data: string }): Promise<void>;
  addLayer(options: NativeMapRef & { layer: string }): Promise<void>;
  setVisible(options: NativeMapRef & { id: string; visible: boolean }): Promise<void>;
  addImage(options: NativeMapRef & { id: string; png: string; scale: number }): Promise<void>;
  /** Option of the Mapbox Standard style. */
  setConfig(options: NativeMapRef & { name: string; value: string | boolean }): Promise<void>;
  /**
   * Keeps styles and the map along a line for offline use. Replaces what was
   * saved under the same id. Needs no open map.
   */
  saveOffline(options: {
    id: string;
    token: string;
    styles: string[];
    points: readonly (readonly [lon: number, lat: number])[];
  }): Promise<void>;
  addListener(
    event: 'offlineProgress',
    listener: (event: { share: number }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'mapError',
    listener: (event: NativeMapRef & { message: string; rejected: boolean }) => void,
  ): Promise<PluginListenerHandle>;
}

export declare const MapboxNative: MapboxNativePlugin;
