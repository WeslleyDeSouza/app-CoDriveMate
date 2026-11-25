/**
 * Port for Bluetooth LE. The single way the app talks to BLE hardware (OBD
 * adapter, lighting module). Domains depend on this class, never on a plugin.
 */
export interface BleDeviceRef {
  readonly id: string;
  readonly name?: string;
}

/** A device seen while scanning. */
export interface BleFound extends BleDeviceRef {
  /** advertised services, lower case */
  readonly services: readonly string[];
  /** signal strength in dBm */
  readonly rssi: number | null;
}

export interface BleDeviceFilter {
  /** Only offer devices advertising one of these services. */
  services?: string[];
  /** Only offer devices whose name starts with this prefix. */
  namePrefix?: string;
  /** Services that must be reachable after connecting (required on the web). */
  optionalServices?: string[];
}

export interface BleCharacteristicRef {
  readonly service: string;
  readonly characteristic: string;
}

export interface BleCharacteristicInfo extends BleCharacteristicRef {
  readonly canNotify: boolean;
  readonly canWrite: boolean;
  readonly canWriteWithoutResponse: boolean;
}

export type BleUnsubscribe = () => Promise<void>;

export class BleUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Bluetooth LE is not available on this device or browser.', { cause });
    this.name = 'BleUnavailableError';
  }
}

/** The user did not allow Bluetooth; only the device settings can change that. */
export class BlePermissionError extends Error {
  constructor(cause?: unknown) {
    super('Bluetooth is not allowed for this app.', { cause });
    this.name = 'BlePermissionError';
  }
}

export class BleOffError extends Error {
  constructor() {
    super('Bluetooth is switched off.');
    this.name = 'BleOffError';
  }
}

export abstract class BleTransport {
  /** Opens the app's page in the device settings. False where there is none. */
  abstract openSettings(): Promise<boolean>;
  /** Opens the device picker. Rejects if the user cancels. */
  abstract requestDevice(filter?: BleDeviceFilter): Promise<BleDeviceRef>;
  /** Browsers only offer their own picker. */
  canScan(): boolean {
    return false;
  }
  /** Reports devices around until the returned function is called. */
  scan(onFound: (device: BleFound) => void): Promise<BleUnsubscribe> {
    void onFound;
    return Promise.reject(new BleUnavailableError());
  }
  /** Whether a device from an earlier session can be connected without the picker. */
  abstract isKnown(deviceId: string): Promise<boolean>;
  abstract connect(deviceId: string, onDisconnect?: () => void): Promise<void>;
  abstract disconnect(deviceId: string): Promise<void>;
  abstract characteristics(deviceId: string): Promise<BleCharacteristicInfo[]>;
  abstract write(
    deviceId: string,
    target: BleCharacteristicRef,
    data: Uint8Array,
    withoutResponse?: boolean,
  ): Promise<void>;
  abstract subscribe(
    deviceId: string,
    target: BleCharacteristicRef,
    onData: (data: Uint8Array) => void,
  ): Promise<BleUnsubscribe>;
}
