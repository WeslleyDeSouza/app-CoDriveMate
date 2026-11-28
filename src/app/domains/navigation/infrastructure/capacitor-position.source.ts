import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { GeoPosition, PositionSource } from '../domain/ports';

/** Below this speed (m/s) the direction is noise. */
const MIN_SPEED = 1;

/** The part of @capacitor-community/background-geolocation that is used. */
interface BackgroundGeolocation {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions: boolean;
      stale: boolean;
      distanceFilter: number;
    },
    callback: (
      location?: {
        latitude: number;
        longitude: number;
        accuracy: number;
        bearing: number | null;
        speed: number | null;
        time: number | null;
      },
      error?: { code?: string },
    ) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
}
const background = registerPlugin<BackgroundGeolocation>('BackgroundGeolocation');

@Injectable()
export class CapacitorPositionSource extends PositionSource {
  private message: string | null = null;
  /** Starts the native watch again with the present message. */
  private restart?: () => Promise<void>;

  async granted(): Promise<boolean> {
    try {
      return (await Geolocation.checkPermissions()).location === 'granted';
    } catch {
      return false;
    }
  }

  async watch(
    onPosition: (position: GeoPosition) => void,
    onError: () => void,
  ): Promise<() => void> {
    if (!Capacitor.isNativePlatform()) return this.watchWeb(onPosition, onError);
    const { location } = await Geolocation.requestPermissions({ permissions: ['location'] });
    if (location !== 'granted') throw new Error('Location permission denied.');
    return this.watchNative(onPosition, onError);
  }

  async setBackground(message: string | null): Promise<void> {
    if (message === this.message) return;
    this.message = message;
    await this.restart?.();
  }

  private async watchNative(
    onPosition: (position: GeoPosition) => void,
    onError: () => void,
  ): Promise<() => void> {
    let id: string | undefined;
    let run = 0;
    const start = async () => {
      const current = ++run;
      const next = await background.addWatcher(
        {
          ...(this.message
            ? { backgroundMessage: this.message, backgroundTitle: 'CoDriveMate' }
            : {}),
          requestPermissions: false,
          stale: false,
          distanceFilter: 0,
        },
        (position, error) => {
          if (current !== run) return;
          if (!position || error) return onError();
          const { longitude, latitude, accuracy, speed, bearing, time } = position;
          onPosition(toPosition(longitude, latitude, accuracy, speed, bearing, time));
        },
      );
      // The old one goes last, so that there is no gap in between.
      const old = id;
      id = next;
      if (old) await background.removeWatcher({ id: old }).catch(() => undefined);
    };
    await start();
    this.restart = () => start().catch((error: unknown) => console.warn('Location failed', error));
    return () => {
      run++;
      this.restart = undefined;
      if (id) void background.removeWatcher({ id }).catch(() => undefined);
    };
  }

  /** The browser asks by itself when the watch starts. */
  private async watchWeb(
    onPosition: (position: GeoPosition) => void,
    onError: () => void,
  ): Promise<() => void> {
    let stopped = false;
    const id = await new Promise<string>((resolve, reject) => {
      let settled = false;
      const watch = Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 },
        (position, error) => {
          if (stopped) return;
          if (!position) {
            if (!settled && error?.code === 1) reject(new Error('Location permission denied.'));
            else onError();
            return;
          }
          const { longitude, latitude, accuracy, speed, heading, course } = position.coords;
          onPosition(
            toPosition(
              longitude,
              latitude,
              accuracy,
              speed,
              course ?? heading ?? null,
              position.timestamp,
            ),
          );
          if (!settled) {
            settled = true;
            void watch.then(resolve);
          }
        },
      );
      watch.catch(reject);
      // Without a fix (garage) the watch keeps running in the background.
      setTimeout(() => {
        if (settled) return;
        settled = true;
        void watch.then(resolve, reject);
      }, 8000);
    });
    return () => {
      stopped = true;
      void Geolocation.clearWatch({ id });
    };
  }
}

function toPosition(
  longitude: number,
  latitude: number,
  accuracyM: number,
  speed: number | null,
  direction: number | null,
  atMs: number | null,
): GeoPosition {
  const known = typeof speed === 'number' && speed >= 0;
  return {
    coordinate: [longitude, latitude],
    heading: known && speed >= MIN_SPEED ? direction : null,
    accuracyM,
    speedKmh: known ? speed * 3.6 : null,
    atMs,
  };
}
