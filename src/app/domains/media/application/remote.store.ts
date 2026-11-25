import { Injectable, computed, inject, signal } from '@angular/core';
import {
  EMPTY_REMOTE,
  MediaRemote,
  RemoteCommand,
  RemoteConnection,
  RemoteDevice,
  RemoteState,
  applyRemoteMessage,
  remoteNowPlaying,
  remoteRetryS,
} from '../domain/media-remote';

export type RemoteStatus = 'none' | 'connecting' | 'pairing' | 'on' | 'failed';

/** Controls any music app of the iPad through the ESP32 module. */
@Injectable({ providedIn: 'root' })
export class RemoteStore {
  private readonly remote = inject(MediaRemote);
  private readonly _device = signal<RemoteDevice | null>(null);
  private readonly state = signal<RemoteState>(EMPTY_REMOTE);
  private readonly connected = signal(false);
  private readonly failed = signal(false);
  private connection?: RemoteConnection;
  /** Raised to end whatever is going on. */
  private session = 0;

  readonly device = this._device.asReadonly();
  readonly nowPlaying = computed(() => remoteNowPlaying(this.state()));
  readonly status = computed<RemoteStatus>(() => {
    if (!this._device()) return this.failed() ? 'failed' : 'none';
    if (!this.connected()) return 'connecting';
    return this.state().ready ? 'on' : 'pairing';
  });

  constructor() {
    void this.remote
      .known()
      .then((device) => {
        if (device && !this._device()) this.start(device);
      })
      .catch(() => undefined);
  }

  async choose(): Promise<void> {
    this.failed.set(false);
    try {
      const device = await this.remote.choose();
      await this.stop();
      this.start(device);
    } catch (error) {
      // Closing the picker is a decision, not a failure.
      if (!/cancel/i.test(String((error as Error)?.message ?? error))) this.failed.set(true);
    }
  }

  async forget(): Promise<void> {
    this._device.set(null);
    await this.stop();
    await this.remote.forget();
  }

  send(command: RemoteCommand): Promise<void> {
    return this.connection?.send(command) ?? Promise.resolve();
  }

  private start(device: RemoteDevice): void {
    this._device.set(device);
    void this.connect(device, ++this.session, 0);
  }

  private async connect(device: RemoteDevice, session: number, attempt: number): Promise<void> {
    try {
      const connection = await this.remote.open(
        device,
        (message) => {
          if (session === this.session) this.state.update((s) => applyRemoteMessage(s, message));
        },
        () => {
          if (session !== this.session) return;
          this.clear();
          this.retry(device, session, 0);
        },
      );
      if (session !== this.session) return void connection.close();
      this.connection = connection;
      this.connected.set(true);
      await connection.send('sendState').catch(() => undefined);
    } catch {
      this.retry(device, session, attempt + 1);
    }
  }

  private retry(device: RemoteDevice, session: number, attempt: number): void {
    setTimeout(
      () => {
        if (session === this.session) void this.connect(device, session, attempt);
      },
      remoteRetryS(attempt) * 1000,
    );
  }

  private async stop(): Promise<void> {
    this.session++;
    const connection = this.connection;
    this.clear();
    await connection?.close().catch(() => undefined);
  }

  private clear(): void {
    this.connection = undefined;
    this.connected.set(false);
    this.state.set(EMPTY_REMOTE);
  }
}
