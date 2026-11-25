import { Injectable, inject } from '@angular/core';
import { HttpPort } from '@core/http';
import { SettingsStore } from '@domains/settings';
import { LonLat } from '../domain/road';
import { Incident, TrafficSource, mergeIncidents, trafficKind } from '../domain/traffic';

const box = ([lon, lat]: LonLat) =>
  [lon - 0.2, lat - 0.14, lon + 0.2, lat + 0.14].map((value) => value.toFixed(4)).join(',');

const FIELDS =
  '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,' +
  'events{description},from,to,delay,roadNumbers}}}';

interface TomTomIncident {
  readonly geometry?: { readonly type: string; readonly coordinates: unknown };
  readonly properties?: {
    readonly id?: string;
    readonly iconCategory?: number;
    readonly magnitudeOfDelay?: number;
    readonly events?: { readonly description?: string }[];
    readonly from?: string;
    readonly to?: string;
    readonly delay?: number;
    readonly roadNumbers?: string[];
  };
}

/** TomTom with the user's key, and the Swiss messages through the user's own proxy. */
@Injectable()
export class OnlineTrafficSource extends TrafficSource {
  private readonly http = inject(HttpPort);
  private readonly settings = inject(SettingsStore).settings;

  async around(at: LonLat): Promise<Incident[] | null> {
    const { keys, map } = this.settings();
    const answers = await Promise.all([
      keys.tomtom ? this.tomtom(at, keys.tomtom).catch(() => null) : null,
      map.swissTrafficReports && map.swissTrafficUrl
        ? this.swiss(at, map.swissTrafficUrl).catch(() => null)
        : null,
    ]);
    const lists = answers.filter((answer) => answer !== null);
    return lists.length ? mergeIncidents(lists) : null;
  }

  private async tomtom(at: LonLat, key: string): Promise<Incident[] | null> {
    const { ok, body } = await this.http.getJson(
      'https://api.tomtom.com/traffic/services/5/incidentDetails' +
        `?key=${encodeURIComponent(key)}&bbox=${box(at)}&fields=${encodeURIComponent(FIELDS)}` +
        '&language=de-DE&timeValidityFilter=present',
    );
    if (!ok) return null;
    const incidents = (body as { incidents?: TomTomIncident[] } | null)?.incidents ?? [];
    return incidents.flatMap(({ geometry, properties: p = {} }): Incident[] => {
      const kind = trafficKind(p.iconCategory ?? 0);
      const all = geometry?.coordinates;
      if (!kind || !Array.isArray(all) || !all.length) return [];
      const place = geometry?.type === 'Point' ? all : all[Math.floor(all.length / 2)];
      const text = [
        (p.events ?? [])
          .map(({ description }) => description)
          .filter(Boolean)
          .join(', '),
        (p.roadNumbers ?? []).join('/'),
        p.from && p.to ? `${p.from} → ${p.to}` : '',
        (p.delay ?? 0) > 60 ? `+${Math.round((p.delay ?? 0) / 60)} min` : '',
      ];
      const [lon, lat] = place as [number, number];
      return [
        {
          id: 'tt' + (p.id ?? `${lon},${lat}`),
          kind,
          at: [lon, lat],
          text: text.filter(Boolean).join(' · '),
          magnitude: p.magnitudeOfDelay ?? 0,
        },
      ];
    });
  }

  private async swiss(at: LonLat, url: string): Promise<Incident[] | null> {
    const query = (url.includes('?') ? '&' : '?') + 'bbox=' + box(at);
    const { ok, body } = await this.http.getJson(url + query);
    if (!ok) return null;
    const incidents =
      (
        body as {
          incidents?: { id: string; k: number; c?: [number, number]; txt?: string; mag?: number }[];
        } | null
      )?.incidents ?? [];
    return incidents.flatMap(({ id, k, c, txt, mag }): Incident[] => {
      const kind = trafficKind(k);
      return kind && c
        ? [{ id: 'ch' + id, kind, at: c, text: txt ?? '', magnitude: mag ?? 0 }]
        : [];
    });
  }
}
