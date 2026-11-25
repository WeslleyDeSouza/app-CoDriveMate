import { Injectable, inject } from '@angular/core';
import { HttpPort } from './index';

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
/** A server that refused or timed out is left alone for this long. */
const PAUSE_MS = 120_000;

/** OpenStreetMap queries over public servers, which are often overloaded. */
@Injectable({ providedIn: 'root' })
export class OverpassClient {
  private readonly http = inject(HttpPort);
  private readonly pausedUntil = new Map<string, number>();

  /** The answer, or null if no server has one that `read` understands. */
  async query<T>(
    query: string,
    read: (body: unknown) => T | null,
    timeoutMs = 20_000,
  ): Promise<T | null> {
    for (const server of SERVERS) {
      if (navigator.onLine === false) return null;
      if (Date.now() < (this.pausedUntil.get(server) ?? 0)) continue;
      try {
        const result = await this.http.getJson(
          server + '?data=' + encodeURIComponent(query),
          timeoutMs,
        );
        const answer = result.ok ? read(result.body) : null;
        if (answer !== null) return answer;
      } catch {
        // Unreachable or overloaded: paused below like a refusal.
      }
      this.pausedUntil.set(server, Date.now() + PAUSE_MS);
    }
    return null;
  }
}
