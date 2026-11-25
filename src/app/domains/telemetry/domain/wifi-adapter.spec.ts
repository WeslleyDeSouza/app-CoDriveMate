import {
  DEFAULT_WIFI_ENDPOINT,
  parseHost,
  parsePort,
  wifiAdapter,
  wifiEndpoint,
} from './wifi-adapter';

describe('WiFi adapter', () => {
  it('accepts IPv4 addresses and host names', () => {
    expect(parseHost(' 192.168.0.10 ')).toBe('192.168.0.10');
    expect(parseHost('0.0.0.255')).toBe('0.0.0.255');
    expect(parseHost('OBD-Adapter.local')).toBe('obd-adapter.local');
    expect(parseHost('elm327')).toBe('elm327');
  });

  it.each([
    '',
    ' ',
    '192.168.0',
    '192.168.0.256',
    '192.168.0.010',
    '1.2.3.4.5',
    '35000',
    'a b',
    '-a',
    'a-',
    'a..b',
    'http://a',
    'a:1',
    'a'.repeat(64),
    Array(64).fill('aaaa').join('.'),
  ])('refuses the host "%s"', (text) => {
    expect(parseHost(text)).toBeNull();
  });

  it('accepts ports from 1 to 65535', () => {
    expect(['1', ' 35000 ', '65535'].map(parsePort)).toEqual([1, 35000, 65535]);
    for (const text of ['', '0', '65536', '-1', '1.5', '1e3', 'x']) {
      expect(parsePort(text)).toBeNull();
    }
  });

  it('keeps the address in the stored adapter', () => {
    const adapter = wifiAdapter({ host: 'obd.local', port: 23 });
    expect(adapter).toEqual({
      kind: 'wifi',
      id: 'obd.local:23',
      name: 'obd.local:23',
      host: 'obd.local',
      port: 23,
    });
    expect(wifiEndpoint(adapter)).toEqual({ host: 'obd.local', port: 23 });
    expect(wifiEndpoint({ kind: 'wifi', id: 'x', name: 'x' })).toEqual(DEFAULT_WIFI_ENDPOINT);
  });
});
