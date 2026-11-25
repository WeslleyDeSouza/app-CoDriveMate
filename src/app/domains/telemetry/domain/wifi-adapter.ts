import { AdapterRef } from './adapter';

/** Where a WiFi adapter listens. */
export interface WifiEndpoint {
  readonly host: string;
  readonly port: number;
}

/** What nearly all WiFi adapters use. */
export const DEFAULT_WIFI_ENDPOINT: WifiEndpoint = { host: '192.168.0.10', port: 35000 };

/** An IPv4 address or a host name; null if it is neither. */
export function parseHost(text: string): string | null {
  const host = text.trim().toLowerCase();
  // Digits and dots only can be nothing but an address.
  if (/^[\d.]+$/.test(host)) {
    const parts = host.split('.');
    return parts.length === 4 &&
      parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && +part < 256)
      ? host
      : null;
  }
  const label = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  return host.length <= 253 && host.split('.').every((part) => label.test(part)) ? host : null;
}

/** A port from 1 to 65535; null if it is none. */
export function parsePort(text: string): number | null {
  const port = /^\d{1,5}$/.test(text.trim()) ? Number(text) : 0;
  return port >= 1 && port <= 65535 ? port : null;
}

export function wifiAdapter({ host, port }: WifiEndpoint): AdapterRef {
  const id = `${host}:${port}`;
  return { kind: 'wifi', id, name: id, host, port };
}

/** The address of a stored adapter, the usual one where it is missing. */
export function wifiEndpoint(adapter: AdapterRef): WifiEndpoint {
  return {
    host: adapter.host ?? DEFAULT_WIFI_ENDPOINT.host,
    port: adapter.port ?? DEFAULT_WIFI_ENDPOINT.port,
  };
}
