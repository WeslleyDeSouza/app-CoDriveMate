import { Provider } from '@angular/core';
import { BleTransport } from './ble-transport';
import { CapacitorBleTransport } from './capacitor-ble-transport';

export * from './ble-transport';

export function provideBluetooth(): Provider[] {
  return [{ provide: BleTransport, useClass: CapacitorBleTransport }];
}
