import { Injectable, inject } from '@angular/core';
import { BleTransport } from '@core/bluetooth';
import { KeyValueStore } from '@core/storage';
import {
  MediaRemote,
  REMOTE_COMMAND,
  RemoteConnection,
  RemoteDevice,
} from '../domain/media-remote';

const SERVICE = '6e1a0011-7c3b-4d2a-9f10-5049434153d0';
const COMMAND = { service: SERVICE, characteristic: '6e1a0012-7c3b-4d2a-9f10-5049434153d0' };
const STATE = { service: SERVICE, characteristic: '6e1a0013-7c3b-4d2a-9f10-5049434153d0' };
const KEY = 'media/remote';

/** The ESP32 module over Bluetooth LE (firmware/media_remote). */
@Injectable()
export class BleMediaRemote extends MediaRemote {
  private readonly ble = inject(BleTransport);
  private readonly kv = inject(KeyValueStore);

  async known(): Promise<RemoteDevice | null> {
    return (await this.kv.get<RemoteDevice>(KEY)) ?? null;
  }

  async choose(): Promise<RemoteDevice> {
    const { id, name } = await this.ble.requestDevice({ services: [SERVICE] });
    const device = { id, name: name || 'CoDriveMate Media' };
    await this.kv.set(KEY, device);
    return device;
  }

  forget(): Promise<void> {
    return this.kv.delete(KEY);
  }

  async open(
    device: RemoteDevice,
    onMessage: (message: Uint8Array) => void,
    onClose: () => void,
  ): Promise<RemoteConnection> {
    if (!(await this.ble.isKnown(device.id))) throw new Error('Module must be chosen again.');
    await this.ble.connect(device.id, onClose);
    try {
      const unsubscribe = await this.ble.subscribe(device.id, STATE, onMessage);
      return {
        send: (command) =>
          this.ble.write(device.id, COMMAND, Uint8Array.of(REMOTE_COMMAND[command])),
        close: async () => {
          await unsubscribe().catch(() => undefined);
          await this.ble.disconnect(device.id);
        },
      };
    } catch (error) {
      await this.ble.disconnect(device.id).catch(() => undefined);
      throw error;
    }
  }
}
