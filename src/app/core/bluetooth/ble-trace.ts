import { Injectable } from '@angular/core';
import { BleCharacteristicInfo } from './ble-transport';

export interface BleFrame {
  readonly at: string;
  readonly direction: 'in' | 'out' | 'event';
  readonly characteristic: string;
  readonly hex: string;
  readonly text: string;
}

interface Traced {
  connected: boolean;
  received: number;
  sent: number;
  frames: BleFrame[];
}

const MAX_FRAMES = 120;

/** The last bytes of every Bluetooth device, for finding faults. Kept in memory only. */
@Injectable({ providedIn: 'root' })
export class BleTrace {
  private readonly devices = new Map<string, Traced>();

  connected(id: string, connected: boolean): void {
    this.of(id).connected = connected;
    this.add(id, 'event', '', new Uint8Array(), connected ? 'connected' : 'disconnected');
  }

  data(id: string, direction: 'in' | 'out', characteristic: string, bytes: Uint8Array): void {
    const device = this.of(id);
    if (direction === 'in') device.received += bytes.length;
    else device.sent += bytes.length;
    this.add(id, direction, characteristic, bytes, printable(bytes));
  }

  /** Null if nothing was heard of the device since the app started. */
  report(id: string, characteristics: readonly BleCharacteristicInfo[] | null): object | null {
    const device = this.devices.get(id);
    if (!device) return null;
    const { connected, received, sent, frames } = device;
    return { connected, bytesReceived: received, bytesSent: sent, characteristics, frames };
  }

  private add(
    id: string,
    direction: BleFrame['direction'],
    characteristic: string,
    bytes: Uint8Array,
    text: string,
  ): void {
    const { frames } = this.of(id);
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
    frames.push({ at: new Date().toISOString(), direction, characteristic, hex, text });
    if (frames.length > MAX_FRAMES) frames.shift();
  }

  private of(id: string): Traced {
    let device = this.devices.get(id);
    if (!device) {
      device = { connected: false, received: 0, sent: 0, frames: [] };
      this.devices.set(id, device);
    }
    return device;
  }
}

function printable(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes).replace(/[^\x20-\x7e\u00a0-\uffff]/g, '·');
}
