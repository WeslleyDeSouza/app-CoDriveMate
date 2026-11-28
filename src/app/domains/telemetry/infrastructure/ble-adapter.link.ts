import { Injectable, inject } from '@angular/core';
import { BleTransport } from '@core/bluetooth';
import { KeyValueStore } from '@core/storage';
import {
  AdapterConnection,
  AdapterLink,
  AdapterRef,
  AdapterRepository,
  AdapterSettings,
  AdapterUnknownError,
  DEFAULT_ADAPTER_SETTINGS,
  FoundAdapter,
} from '../domain/adapter';
import { matchAdapter } from '../domain/adapter-match';

/**
 * Services of common ELM327 BLE adapters (Vgate iCar Pro 2S and clones).
 * Taken from the prototype. One adapter («IOS-Vlink») connected with them in
 * the car on 2026-11-28; which of the services it used is not recorded.
 */
export const ELM327_BLE_SERVICES = [
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

/** Bluetooth LE, from version 4.0 up to 5.x. */
@Injectable()
export class BleAdapterLink extends AdapterLink {
  readonly kind = 'ble' as const;
  private readonly ble = inject(BleTransport);

  openSettings(): Promise<boolean> {
    return this.ble.openSettings();
  }

  override canScan(): boolean {
    return this.ble.canScan();
  }

  override scan(onFound: (found: FoundAdapter) => void): Promise<() => Promise<void>> {
    return this.ble.scan(({ id, name, services, rssi }) =>
      onFound({
        adapter: { kind: this.kind, id, name: name ?? '' },
        match: matchAdapter(name, services, ELM327_BLE_SERVICES),
        rssi,
      }),
    );
  }

  async choose(): Promise<AdapterRef> {
    const device = await this.ble.requestDevice({ optionalServices: ELM327_BLE_SERVICES });
    return { kind: this.kind, id: device.id, name: device.name || 'OBD' };
  }

  async open(
    adapter: AdapterRef,
    onData: (data: Uint8Array) => void,
    onClose: () => void,
  ): Promise<AdapterConnection> {
    if (!(await this.ble.isKnown(adapter.id))) throw new AdapterUnknownError();
    await this.ble.connect(adapter.id, onClose);
    try {
      // The UART service differs between adapters: take the first service that
      // has both a notifying and a writable characteristic.
      const all = await this.ble.characteristics(adapter.id);
      const service = [...new Set(all.map((c) => c.service))]
        .map((uuid) => all.filter((c) => c.service === uuid))
        .find(
          (cs) =>
            cs.some((c) => c.canNotify) && cs.some((c) => c.canWrite || c.canWriteWithoutResponse),
        );
      const rx = service?.find((c) => c.canNotify);
      const tx = service?.find((c) => c.canWrite || c.canWriteWithoutResponse);
      if (!rx || !tx) throw new Error('No OBD serial service found on this device.');
      const unsubscribe = await this.ble.subscribe(adapter.id, rx, onData);
      return {
        write: (data) => this.ble.write(adapter.id, tx, data, tx.canWriteWithoutResponse),
        close: async () => {
          await unsubscribe().catch(() => undefined);
          await this.ble.disconnect(adapter.id).catch(() => undefined);
        },
      };
    } catch (error) {
      await this.ble.disconnect(adapter.id).catch(() => undefined);
      throw error;
    }
  }
}

const KEY = 'telemetry/adapter';

@Injectable()
export class IdbAdapterRepository extends AdapterRepository {
  private readonly kv = inject(KeyValueStore);

  async load(): Promise<AdapterSettings> {
    return { ...DEFAULT_ADAPTER_SETTINGS, ...(await this.kv.get<AdapterSettings>(KEY)) };
  }

  save(settings: AdapterSettings): Promise<void> {
    return this.kv.set(KEY, settings);
  }
}
