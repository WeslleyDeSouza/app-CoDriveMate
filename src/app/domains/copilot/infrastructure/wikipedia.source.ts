import { Injectable, inject } from '@angular/core';
import { HttpPort } from '@core/http';
import { KeyValueStore, LegacyMigration } from '@core/storage';
import {
  Landmark,
  LandmarkSource,
  LonLat,
  QuizScore,
  TalkRepository,
} from '../domain/conversation';
import { Serial } from '../domain/passenger';

const RADIUS_M = 10000;
const LIMIT = 40;

/** Places with an article nearby. Free, without a key. */
@Injectable()
export class WikipediaSource extends LandmarkSource {
  private readonly http = inject(HttpPort);

  async near([lon, lat]: LonLat, lang: string): Promise<Landmark[]> {
    // About 100 m is exact enough and says less about the driver.
    const point = `${lat.toFixed(3)}|${lon.toFixed(3)}`;
    const body = await this.query(
      lang,
      `list=geosearch&gscoord=${encodeURIComponent(point)}&gsradius=${RADIUS_M}&gslimit=${LIMIT}`,
    );
    const hits =
      (body as { geosearch?: { pageid: number; title: string; lon: number; lat: number }[] } | null)
        ?.geosearch ?? [];
    return hits.map((hit) => ({ id: hit.pageid, title: hit.title, at: [hit.lon, hit.lat] }));
  }

  async extract(id: number, lang: string): Promise<string> {
    const body = await this.query(
      lang,
      `prop=extracts&exintro=1&explaintext=1&exsentences=5&pageids=${id}`,
    );
    const pages = (body as { pages?: Record<string, { extract?: string }> } | null)?.pages;
    return (pages?.[id]?.extract ?? '').replace(/\s+/g, ' ').trim();
  }

  private async query(lang: string, parameters: string): Promise<unknown> {
    const language = /^[a-z]{2}$/.test(lang) ? lang : 'de';
    const { ok, body } = await this.http.getJson(
      `https://${language}.wikipedia.org/w/api.php?action=query&${parameters}&format=json&origin=*`,
    );
    if (!ok) throw new Error('Wikipedia not available.');
    return (body as { query?: unknown } | null)?.query ?? null;
  }
}

const SEEN_KEY = 'copilot/seen';
const TOLD_KEY = 'copilot/told';
const SERIAL_KEY = 'copilot/serial';
const SCORE_KEY = 'copilot/quiz-score';

@Injectable()
export class IdbTalkRepository extends TalkRepository {
  private readonly kv = inject(KeyValueStore);

  async loadSeen(): Promise<readonly number[]> {
    return (await this.kv.get<number[]>(SEEN_KEY)) ?? [];
  }

  saveSeen(ids: readonly number[]): Promise<void> {
    return this.kv.set(SEEN_KEY, [...ids]);
  }

  async loadTold(): Promise<readonly string[]> {
    return (await this.kv.get<string[]>(TOLD_KEY)) ?? [];
  }

  saveTold(told: readonly string[]): Promise<void> {
    return this.kv.set(TOLD_KEY, [...told]);
  }

  async loadSerial(): Promise<Serial | null> {
    return (await this.kv.get<Serial | null>(SERIAL_KEY)) ?? null;
  }

  saveSerial(serial: Serial | null): Promise<void> {
    return this.kv.set(SERIAL_KEY, serial);
  }

  async loadScore(): Promise<QuizScore | null> {
    return (await this.kv.get<QuizScore>(SCORE_KEY)) ?? null;
  }

  saveScore(score: QuizScore): Promise<void> {
    return this.kv.set(SCORE_KEY, score);
  }
}

/** Imports which places the prototype already told about (`pd_wseen`). */
export const copilotLegacyMigration: LegacyMigration = {
  id: 'copilot-v1',
  async migrate({ source, kv }) {
    const seen = source.localJson<number[]>('pd_wseen');
    if (!Array.isArray(seen) || (await kv.get(SEEN_KEY)) !== undefined) return;
    await kv.set(SEEN_KEY, seen);
  },
};
