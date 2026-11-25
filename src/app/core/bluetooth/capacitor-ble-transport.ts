import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import {
  BleCharacteristicInfo,
  BleCharacteristicRef,
  BleDeviceFilter,
  BleDeviceRef,
  BleFound,
  BleOffError,
  BlePermissionError,
  BleTransport,
  BleUnavailableError,
  BleUnsubscribe,
} from './ble-transport';

/**
 * BleTransport on top of @capacitor-community/bluetooth-le. The plugin runs
 * natively on Android and iOS and falls back to Web Bluetooth in the browser,
 * so this one adapter covers all three targets.
 */
@Injectable()
export class CapacitorBleTransport extends BleTransport {
  private initialized?: Promise<void>;
  /** Devices picked in this session. */
  private readonly seen = new Set<string>();

  private ready(): Promise<void> {
    // The adapter's position is never derived from the scan, so Android does not
    // need the location permission for it (see AndroidManifest.xml).
    this.initialized ??= BleClient.initialize({ androidNeverForLocation: true }).catch(
      (error: unknown) => {
        this.initialized = undefined;
        // Asked and refused, now or earlier.
        throw /permission|denied|unauthori[sz]ed/i.test(String((error as Error)?.message ?? error))
          ? new BlePermissionError(error)
          : new BleUnavailableError(error);
      },
    );
    return this.initialized;
  }

  private async enabled(): Promise<void> {
    await this.ready();
    if (Capacitor.isNativePlatform() && !(await BleClient.isEnabled())) throw new BleOffError();
  }

  async openSettings(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    await BleClient.openAppSettings();
    return true;
  }

  async requestDevice(filter: BleDeviceFilter = {}): Promise<BleDeviceRef> {
    await this.enabled();
    const device = await BleClient.requestDevice(filter);
    this.seen.add(device.deviceId);
    return { id: device.deviceId, name: device.name };
  }

  override canScan(): boolean {
    return Capacitor.isNativePlatform();
  }

  override async scan(onFound: (device: BleFound) => void): Promise<BleUnsubscribe> {
    await this.enabled();
    await BleClient.requestLEScan({}, ({ device, localName, rssi, uuids }) => {
      this.seen.add(device.deviceId);
      onFound({
        id: device.deviceId,
        name: localName || device.name,
        services: [...(uuids ?? []), ...(device.uuids ?? [])].map((uuid) => uuid.toLowerCase()),
        rssi: rssi ?? null,
      });
    });
    return () => BleClient.stopLEScan();
  }

  async isKnown(deviceId: string): Promise<boolean> {
    await this.ready();
    if (this.seen.has(deviceId)) return true;
    try {
      const devices = await BleClient.getDevices([deviceId]);
      return devices.some((device) => device.deviceId === deviceId);
    } catch {
      // Most browsers do not remember devices between visits.
      return false;
    }
  }

  async connect(deviceId: string, onDisconnect?: () => void): Promise<void> {
    await this.enabled();
    await BleClient.connect(deviceId, () => onDisconnect?.());
  }

  async disconnect(deviceId: string): Promise<void> {
    await BleClient.disconnect(deviceId);
  }

  async characteristics(deviceId: string): Promise<BleCharacteristicInfo[]> {
    const services = await BleClient.getServices(deviceId);
    return services.flatMap((service) =>
      service.characteristics.map((c) => ({
        service: service.uuid,
        characteristic: c.uuid,
        canNotify: c.properties.notify || c.properties.indicate,
        canWrite: c.properties.write,
        canWriteWithoutResponse: c.properties.writeWithoutResponse,
      })),
    );
  }

  async write(
    deviceId: string,
    target: BleCharacteristicRef,
    data: Uint8Array,
    withoutResponse = false,
  ): Promise<void> {
    const value = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (withoutResponse) {
      await BleClient.writeWithoutResponse(deviceId, target.service, target.characteristic, value);
    } else {
      await BleClient.write(deviceId, target.service, target.characteristic, value);
    }
  }

  async subscribe(
    deviceId: string,
    target: BleCharacteristicRef,
    onData: (data: Uint8Array) => void,
  ): Promise<BleUnsubscribe> {
    await BleClient.startNotifications(deviceId, target.service, target.characteristic, (value) =>
      onData(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
    );
    return () => BleClient.stopNotifications(deviceId, target.service, target.characteristic);
  }
}
