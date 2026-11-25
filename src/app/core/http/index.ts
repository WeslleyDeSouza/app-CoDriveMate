import { Injectable, Provider } from '@angular/core';
import { Capacitor, CapacitorHttp, HttpOptions, HttpResponse } from '@capacitor/core';

export interface HttpResult {
  readonly status: number;
  readonly ok: boolean;
  /** Parsed JSON body, null if the answer was not JSON. */
  readonly body: unknown;
}

/** Port for all HTTP requests. Rejects only when there is no connection. */
export abstract class HttpPort {
  abstract getJson(url: string, timeoutMs?: number): Promise<HttpResult>;
  /** Binary content, null if the server has none. */
  abstract getBlob(url: string): Promise<Blob | null>;
  /** A request in the shape of `fetch`, for libraries that bring their own client. */
  abstract fetch(url: string, init: RequestInit): Promise<Response>;
  /** Like `fetch`, for an answer that is not text. */
  abstract fetchBinary(url: string, init: RequestInit): Promise<Response>;
}

const TIMEOUT_MS = 15000;
/** The plugin alone would wait ten minutes for a connection that was lost. */
const FETCH_TIMEOUT_MS = 60_000;

/** Native: CapacitorHttp (no CORS). Web: fetch. */
@Injectable()
export class CapacitorHttpPort extends HttpPort {
  async getJson(url: string, timeoutMs = TIMEOUT_MS): Promise<HttpResult> {
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.get({
        url,
        responseType: 'json',
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      });
      const body = typeof response.data === 'string' ? parse(response.data) : response.data;
      return { status: response.status, ok: response.status >= 200 && response.status < 300, body };
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return { status: response.status, ok: response.ok, body: parse(await response.text()) };
  }

  /** Always fetch: the plugin would pass binary data as text. Needs CORS. */
  async getBlob(url: string): Promise<Blob | null> {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return response.ok ? response.blob() : null;
  }

  async fetchBinary(url: string, init: RequestInit): Promise<Response> {
    if (!Capacitor.isNativePlatform()) return fetch(url, init);
    const { data, status } = await request(
      {
        url,
        method: init.method ?? 'GET',
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        data: typeof init.body === 'string' ? parse(init.body) : undefined,
        responseType: 'arraybuffer',
      },
      init.signal,
    );
    // The plugin hands binary data over as base64; errors come as JSON.
    if (status < 300 && typeof data === 'string') {
      return new Response(
        Uint8Array.from(atob(data), (char) => char.charCodeAt(0)),
        { status },
      );
    }
    return new Response(typeof data === 'string' ? data : JSON.stringify(data ?? null), { status });
  }

  async fetch(url: string, init: RequestInit): Promise<Response> {
    if (!Capacitor.isNativePlatform()) return fetch(url, init);
    const response = await request(
      {
        url,
        method: init.method ?? 'GET',
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        data: typeof init.body === 'string' ? parse(init.body) : undefined,
        responseType: 'text',
      },
      init.signal,
    );
    const body =
      typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? null);
    return new Response(body, { status: response.status, headers: response.headers });
  }
}

/** The plugin knows no signal, so an aborted request is left behind. */
function request(options: HttpOptions, signal?: AbortSignal | null): Promise<HttpResponse> {
  const limit = { connectTimeout: FETCH_TIMEOUT_MS, readTimeout: FETCH_TIMEOUT_MS };
  const answer = CapacitorHttp.request({ ...options, ...limit });
  if (!signal) return answer;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    signal.addEventListener('abort', abort, { once: true });
    void answer.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function provideHttp(): Provider[] {
  return [{ provide: HttpPort, useClass: CapacitorHttpPort }];
}
