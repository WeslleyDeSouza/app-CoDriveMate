import { Injectable, inject } from '@angular/core';
import { BleTransport } from '@core/bluetooth';
import { KeyValueStore, LegacyMigration } from '@core/storage';
import {
  LegacyLight,
  LightConnection,
  LightDevice,
  LightModule,
  LightRepository,
  LightSearch,
  LightState,
  lightFromLegacy,
} from '../domain/lighting';

const SERVICE = '6e1a0001-7c3b-4d2a-9f10-5049434153d0';
const COMMAND = { service: SERVICE, characteristic: '6e1a0002-7c3b-4d2a-9f10-5049434153d0' };
const STATE = { service: SERVICE, characteristic: '6e1a0003-7c3b-4d2a-9f10-5049434153d0' };
const NAMES: Record<Exclude<LightSearch, 'service'>, string> = {
  currus: 'Currus Licht',
  picasso: 'Picasso Licht',
};

/** The ESP32 module over Bluetooth LE. NOT verified on a device. */
@Injectable()
export class BleLightModule extends LightModule {
  private readonly ble = inject(BleTransport);

  async choose(search: LightSearch): Promise<LightDevice> {
    const filter = search === 'service' ? { services: [SERVICE] } : { namePrefix: NAMES[search] };
    const { id, name } = await this.ble.requestDevice({ ...filter, optionalServices: [SERVICE] });
    return { id, name: name || 'Licht' };
  }

  async open(
    device: LightDevice,
    onState: (data: Uint8Array) => void,
    onClose: () => void,
  ): Promise<LightConnection> {
    if (!(await this.ble.isKnown(device.id))) throw new Error('Module must be chosen again.');
    await this.ble.connect(device.id, onClose);
    try {
      const all = await this.ble.characteristics(device.id);
      const command = all.find(({ characteristic }) => characteristic === COMMAND.characteristic);
      // The state is nice to have; the light works without.
      const unsubscribe = await this.ble
        .subscribe(device.id, STATE, onState)
        .catch(() => async () => undefined);
      return {
        send: (data) =>
          this.ble.write(device.id, COMMAND, data, command?.canWriteWithoutResponse ?? false),
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

const STATE_KEY = 'lighting';
const DEVICE_KEY = 'lighting/device';

@Injectable()
export class IdbLightRepository extends LightRepository {
  private readonly kv = inject(KeyValueStore);

  load(): Promise<LightState | undefined> {
    return this.kv.get<LightState>(STATE_KEY);
  }
  save(state: LightState): Promise<void> {
    return this.kv.set(STATE_KEY, state);
  }
  loadDevice(): Promise<LightDevice | undefined> {
    return this.kv.get<LightDevice>(DEVICE_KEY);
  }
  saveDevice(device: LightDevice): Promise<void> {
    return this.kv.set(DEVICE_KEY, device);
  }
}

/** Imports the prototype's light (`pd_light`). */
export const lightingLegacyMigration: LegacyMigration = {
  id: 'lighting-v1',
  async migrate({ source, kv }) {
    const legacy = source.localJson<LegacyLight>('pd_light');
    if (!legacy || (await kv.get(STATE_KEY)) !== undefined) return;
    await kv.set(STATE_KEY, lightFromLegacy(legacy));
  },
};
