import { Injectable, InjectionToken, inject } from '@angular/core';
import { SerialNative, SerialNativePlugin } from '@codrivemate/serial-native';
import { AdapterConnection, AdapterLink, AdapterRef, AdapterUnknownError } from '../domain/adapter';
import { DEFAULT_WIFI_ENDPOINT, wifiAdapter, wifiEndpoint } from '../domain/wifi-adapter';

export const SERIAL_PLUGIN = new InjectionToken<SerialNativePlugin>('SERIAL_PLUGIN', {
  providedIn: 'root',
  factory: () => SerialNative,
});

/** iOS asks for local network access during the first attempt. */
const CONNECT_TIMEOUT_MS = 10_000;

/** Protocols of MFi OBD adapters, as in Info.plist. NOT verified on a real device. */
export const MFI_PROTOCOLS: readonly string[] = ['com.obdlink'];

let connections = 0;

/** Opens a channel of the plugin and follows its events until it ends. */
async function openChannel(
  plugin: SerialNativePlugin,
  connect: (id: string) => Promise<void>,
  onData: (data: Uint8Array) => void,
  onClose: () => void,
): Promise<AdapterConnection> {
  // Differs from the ids of an earlier page, whose channels may still be open.
  const id = `obd-${Date.now().toString(36)}-${++connections}`;
  const handles: { remove(): Promise<void> }[] = [];
  let open = true;
  const release = async () => {
    open = false;
    await Promise.all(handles.splice(0).map((handle) => handle.remove().catch(() => undefined)));
  };
  try {
    handles.push(
      await plugin.addListener('data', (event) => {
        if (open && event.id === id) {
          onData(Uint8Array.from(atob(event.data), (char) => char.charCodeAt(0)));
        }
      }),
    );
    handles.push(
      await plugin.addListener('closed', (event) => {
        if (!open || event.id !== id) return;
        void release();
        onClose();
      }),
    );
    await connect(id);
  } catch (error) {
    await release();
    throw error;
  }
  return {
    write: (data) => plugin.write({ id, data: btoa(String.fromCharCode(...data)) }),
    close: async () => {
      await release();
      await plugin.close({ id }).catch(() => undefined);
    },
  };
}

/** Adapters with their own WiFi, reached over TCP. Native apps only. */
@Injectable()
export class TcpAdapterLink extends AdapterLink {
  readonly kind = 'wifi' as const;
  private readonly plugin = inject(SERIAL_PLUGIN);

  async openSettings(): Promise<boolean> {
    return false;
  }

  /** There is nothing to search for: the address is known or typed in. */
  async choose(): Promise<AdapterRef> {
    return wifiAdapter(DEFAULT_WIFI_ENDPOINT);
  }

  open(
    adapter: AdapterRef,
    onData: (data: Uint8Array) => void,
    onClose: () => void,
  ): Promise<AdapterConnection> {
    return openChannel(
      this.plugin,
      (id) =>
        this.plugin.connectTcp({ id, ...wifiEndpoint(adapter), timeoutMs: CONNECT_TIMEOUT_MS }),
      onData,
      onClose,
    );
  }
}

/** Adapters certified by Apple, paired in the iOS settings. iOS only. */
@Injectable()
export class MfiAdapterLink extends AdapterLink {
  readonly kind = 'mfi' as const;
  private readonly plugin = inject(SERIAL_PLUGIN);

  async openSettings(): Promise<boolean> {
    return false;
  }

  override async connected(): Promise<readonly AdapterRef[]> {
    return (await this.accessories()).map(({ id, name }) => ({ kind: this.kind, id, name }));
  }

  async choose(): Promise<AdapterRef> {
    const adapters = await this.connected();
    if (adapters.length !== 1) throw new AdapterUnknownError();
    return adapters[0];
  }

  async open(
    adapter: AdapterRef,
    onData: (data: Uint8Array) => void,
    onClose: () => void,
  ): Promise<AdapterConnection> {
    const accessory = (await this.accessories()).find(({ id }) => id === adapter.id);
    // Out of range or without power: normal, trying again later helps.
    if (!accessory) throw new Error('The accessory is not connected.');
    return openChannel(
      this.plugin,
      (id) =>
        this.plugin.connectAccessory({
          id,
          accessoryId: accessory.id,
          protocol: accessory.protocol,
        }),
      onData,
      onClose,
    );
  }

  private async accessories(): Promise<{ id: string; name: string; protocol: string }[]> {
    const { accessories } = await this.plugin.listAccessories();
    return accessories.flatMap(({ id, name, protocols }) => {
      const protocol = MFI_PROTOCOLS.find((known) => protocols.includes(known));
      return protocol ? [{ id, name: name || 'OBD', protocol }] : [];
    });
  }
}
