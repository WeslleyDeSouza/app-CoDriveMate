import { TestBed } from '@angular/core/testing';
import { AdapterRef, AdapterUnknownError } from '../domain/adapter';
import { Elm327 } from '../domain/elm327';
import { wifiAdapter } from '../domain/wifi-adapter';
import { MfiAdapterLink, SERIAL_PLUGIN, TcpAdapterLink } from './serial-adapter.links';

type Event = { id: string; data: string };

class FakeSerialPlugin {
  readonly listeners = new Set<{ event: string; listener: (event: Event) => void }>();
  readonly connects: Record<string, unknown>[] = [];
  readonly written: string[] = [];
  readonly closes: string[] = [];
  connectError?: Error;
  accessories = [
    { id: 'S1', name: 'OBDLink MX+', protocols: ['com.obdlink'] },
    { id: 'S2', name: 'Printer', protocols: [] as string[] },
  ];

  async addListener(event: string, listener: (event: Event) => void) {
    const entry = { event, listener };
    this.listeners.add(entry);
    return { remove: async () => void this.listeners.delete(entry) };
  }
  async connectTcp(options: Record<string, unknown>): Promise<void> {
    this.connects.push(options);
    if (this.connectError) throw this.connectError;
  }
  connectAccessory(options: Record<string, unknown>): Promise<void> {
    return this.connectTcp(options);
  }
  async listAccessories() {
    return { accessories: this.accessories };
  }
  async write({ data }: Event): Promise<void> {
    this.written.push(atob(data));
  }
  async close({ id }: { id: string }): Promise<void> {
    this.closes.push(id);
  }
  fire(event: string, id: string, text = ''): void {
    for (const entry of [...this.listeners]) {
      if (entry.event === event) entry.listener({ id, data: btoa(text) });
    }
  }
  id(index = 0): string {
    return this.connects[index]['id'] as string;
  }
}

describe('serial adapter links', () => {
  const ADDRESS = wifiAdapter({ host: '10.0.0.5', port: 23 });
  let plugin: FakeSerialPlugin;
  let tcp: TcpAdapterLink;
  let mfi: MfiAdapterLink;
  let received: string[];
  let closed: number;

  beforeEach(() => {
    plugin = new FakeSerialPlugin();
    received = [];
    closed = 0;
    TestBed.configureTestingModule({
      providers: [TcpAdapterLink, MfiAdapterLink, { provide: SERIAL_PLUGIN, useValue: plugin }],
    });
    tcp = TestBed.inject(TcpAdapterLink);
    mfi = TestBed.inject(MfiAdapterLink);
  });

  const open = (link: TcpAdapterLink | MfiAdapterLink, adapter: AdapterRef) =>
    link.open(
      adapter,
      (data) => received.push(new TextDecoder().decode(data)),
      () => closed++,
    );

  it('connects to the address of the adapter', async () => {
    await open(tcp, ADDRESS);
    expect(plugin.connects[0]).toMatchObject({ host: '10.0.0.5', port: 23, timeoutMs: 10000 });
  });

  it('takes the usual address where none is stored', async () => {
    await open(tcp, { kind: 'wifi', id: 'old', name: 'old' });
    expect(plugin.connects[0]).toMatchObject({ host: '192.168.0.10', port: 35000 });
    expect((await tcp.choose()).id).toBe('192.168.0.10:35000');
  });

  it('passes bytes both ways, only of its own connection', async () => {
    const first = await open(tcp, ADDRESS);
    await open(tcp, ADDRESS);
    expect(plugin.id(0)).not.toBe(plugin.id(1));
    await first.write(new TextEncoder().encode('ATZ\r'));
    expect(plugin.written).toEqual(['ATZ\r']);
    plugin.fire('data', plugin.id(0), 'OK>');
    plugin.fire('data', 'other', 'no');
    expect(received).toEqual(['OK>']);
  });

  it('reports a drop once and lets go of the events', async () => {
    await open(tcp, ADDRESS);
    plugin.fire('closed', 'other');
    expect(closed).toBe(0);
    plugin.fire('closed', plugin.id());
    plugin.fire('closed', plugin.id());
    expect(closed).toBe(1);
    expect(plugin.listeners.size).toBe(0);
  });

  it('closes without reporting it', async () => {
    const connection = await open(tcp, ADDRESS);
    await connection.close();
    plugin.fire('closed', plugin.id());
    expect(plugin.closes).toEqual([plugin.id()]);
    expect(closed).toBe(0);
    expect(plugin.listeners.size).toBe(0);
  });

  it('lets go of the events when connecting fails', async () => {
    plugin.connectError = new Error('Timeout');
    await expect(open(tcp, ADDRESS)).rejects.toThrow('Timeout');
    expect(plugin.listeners.size).toBe(0);
  });

  it('carries the ELM327 conversation', async () => {
    const elm = await Elm327.connect(tcp, ADDRESS, () => undefined);
    const answer = elm.command('ATI');
    await vi.waitFor(() => expect(plugin.written).toEqual(['ATI\r']));
    plugin.fire('data', plugin.id(), 'ELM327 ');
    plugin.fire('data', plugin.id(), 'v1.5\r\r>');
    expect(await answer).toBe('ELM327 v1.5');
  });

  it('offers only accessories with a known protocol', async () => {
    const adapter = { kind: 'mfi', id: 'S1', name: 'OBDLink MX+' };
    expect(await mfi.connected()).toEqual([adapter]);
    expect(await mfi.choose()).toEqual(adapter);
    plugin.accessories = [];
    await expect(mfi.choose()).rejects.toBeInstanceOf(AdapterUnknownError);
  });

  it('opens an accessory with its protocol', async () => {
    const adapter: AdapterRef = { kind: 'mfi', id: 'S1', name: 'OBDLink MX+' };
    await open(mfi, adapter);
    expect(plugin.connects[0]).toMatchObject({ accessoryId: 'S1', protocol: 'com.obdlink' });
    plugin.accessories = [];
    const failed = open(mfi, adapter);
    await expect(failed).rejects.toThrow('not connected');
    await expect(failed).rejects.not.toBeInstanceOf(AdapterUnknownError);
  });
});
