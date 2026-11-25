import type { AdapterMatch } from './adapter-match';

/** How an OBD adapter is reached. Only kinds with an AdapterLink can be used. */
export type AdapterKind = 'ble' | 'wifi' | 'mfi';

export const ADAPTER_KINDS: readonly AdapterKind[] = ['ble', 'wifi', 'mfi'];

export interface AdapterRef {
  readonly kind: AdapterKind;
  readonly id: string;
  readonly name: string;
  /** WiFi only */
  readonly host?: string;
  readonly port?: number;
}

export interface AdapterSettings {
  readonly adapter: AdapterRef | null;
  /** connect when the app starts */
  readonly autoConnect: boolean;
}

export const DEFAULT_ADAPTER_SETTINGS: AdapterSettings = { adapter: null, autoConnect: false };

/** An open byte channel to an adapter. */
export interface AdapterConnection {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/** A device seen while scanning; only the connection test shows whether it is right. */
export interface FoundAdapter {
  readonly adapter: AdapterRef;
  readonly match: AdapterMatch;
  /** signal strength in dBm */
  readonly rssi: number | null;
}

/** Port: one way to reach adapters. A new kind is a new link, nothing else. */
export abstract class AdapterLink {
  abstract readonly kind: AdapterKind;
  /** Opens the device settings where access is allowed. False where there are none. */
  abstract openSettings(): Promise<boolean>;
  /** Lets the user pick an adapter. Needs a tap. Rejects if cancelled. */
  abstract choose(): Promise<AdapterRef>;
  /** False: `choose` opens the picker of the system instead. */
  canScan(): boolean {
    return false;
  }
  /** Reports devices around until the returned function is called. */
  scan(onFound: (found: FoundAdapter) => void): Promise<() => Promise<void>> {
    void onFound;
    return Promise.reject(new Error('This kind cannot be scanned.'));
  }
  /** Adapters the system has connected already, for kinds that know them. */
  connected(): Promise<readonly AdapterRef[]> {
    return Promise.resolve([]);
  }
  /** Opens a known adapter without asking. */
  abstract open(
    adapter: AdapterRef,
    onData: (data: Uint8Array) => void,
    onClose: () => void,
  ): Promise<AdapterConnection>;
}

/** Port: where the chosen adapter is kept. */
export abstract class AdapterRepository {
  abstract load(): Promise<AdapterSettings>;
  abstract save(settings: AdapterSettings): Promise<void>;
}

/** The system no longer lets the app use the adapter; it must be chosen again. */
export class AdapterUnknownError extends Error {
  constructor(cause?: unknown) {
    super('The adapter must be chosen again.', { cause });
    this.name = 'AdapterUnknownError';
  }
}

export type TestStepId = 'connect' | 'adapter' | 'voltage' | 'ecu' | 'values';

export interface TestStep {
  readonly id: TestStepId;
  readonly state: 'waiting' | 'running' | 'ok' | 'failed' | 'skipped';
  readonly detail: string;
}

export const TEST_STEPS: readonly TestStepId[] = ['connect', 'adapter', 'voltage', 'ecu', 'values'];

/** Seconds until the next attempt after a lost connection. */
export function reconnectDelayS(attempt: number): number {
  return [2, 5, 10, 30][Math.min(attempt, 3)];
}
