import { Injectable, inject } from '@angular/core';
import { HttpPort } from '@core/http';
import { SettingsStore } from '@domains/settings';
import { QuotaExhaustedError } from '@shared/kernel/provider-chain';
import { Coordinate, polyline, snap } from '../domain/geo';
import { NavigationService } from '../domain/ports';
import {
  Congestion,
  KeyRejectedError,
  NoRouteError,
  Place,
  Route,
  RouteStep,
} from '../domain/route';

const ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const PLACES = 'https://places.googleapis.com/v1/places:searchText';
const ROUTE_FIELDS = [
  'routes.duration',
  'routes.staticDuration',
  'routes.polyline.geoJsonLinestring',
  'routes.legs.steps.startLocation',
  'routes.legs.steps.navigationInstruction',
  'routes.travelAdvisory.speedReadingIntervals',
].join(',');
const PLACE_FIELDS = 'places.displayName,places.formattedAddress,places.location';

interface GoogleRoutes {
  readonly routes?: {
    readonly duration: string;
    readonly staticDuration?: string;
    readonly polyline: { readonly geoJsonLinestring: { readonly coordinates: [number, number][] } };
    readonly legs: {
      readonly steps?: {
        readonly startLocation?: { readonly latLng: { latitude: number; longitude: number } };
        readonly navigationInstruction?: {
          readonly maneuver?: string;
          readonly instructions?: string;
        };
      }[];
    }[];
    readonly travelAdvisory?: {
      readonly speedReadingIntervals?: {
        readonly startPolylinePointIndex?: number;
        readonly endPolylinePointIndex?: number;
        readonly speed?: string;
      }[];
    };
  }[];
}

/** Google Routes and Places. Used only while the Google map is shown; nothing is stored. */
@Injectable()
export class GoogleNavigationService extends NavigationService {
  readonly id = 'google' as const;
  private readonly http = inject(HttpPort);
  private readonly settings = inject(SettingsStore).settings;

  async route(from: Coordinate, to: Coordinate): Promise<Route> {
    const point = ([longitude, latitude]: Coordinate) => ({
      location: { latLng: { latitude, longitude } },
    });
    const body = await this.post(ROUTES, ROUTE_FIELDS, {
      origin: point(from),
      destination: point(to),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      polylineQuality: 'HIGH_QUALITY',
      polylineEncoding: 'GEO_JSON_LINESTRING',
      extraComputations: ['TRAFFIC_ON_POLYLINE'],
      languageCode: 'de-CH',
    });
    return routeFromGoogle(body);
  }

  async search(text: string, near: Coordinate | null, lang: string): Promise<Place[]> {
    const body = await this.post(PLACES, PLACE_FIELDS, {
      textQuery: text,
      languageCode: lang,
      pageSize: 5,
      ...(near
        ? {
            locationBias: {
              circle: { center: { latitude: near[1], longitude: near[0] }, radius: 50_000 },
            },
          }
        : {}),
    });
    const places =
      (
        body as {
          places?: {
            displayName?: { text?: string };
            formattedAddress?: string;
            location: { latitude: number; longitude: number };
          }[];
        } | null
      )?.places ?? [];
    return places.map(({ displayName, formattedAddress, location }) => ({
      name: displayName?.text ?? text,
      detail: formattedAddress ?? '',
      coordinate: [location.longitude, location.latitude],
      source: this.id,
    }));
  }

  /** Every search costs, so typing does not search; see NavigationStore. */
  async suggest(): Promise<Place[]> {
    return [];
  }

  private async post(url: string, fields: string, body: object): Promise<unknown> {
    const response = await this.http.fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.settings().keys.google,
        'x-goog-fieldmask': fields,
      },
      body: JSON.stringify(body),
    });
    const answer: unknown = await response.json().catch(() => null);
    if (response.ok) return answer;
    const text = JSON.stringify(answer ?? '').toLowerCase();
    const limited = /quota|billing|rate_limit/.test(text);
    if (response.status === 429 || (response.status === 403 && limited)) {
      throw new QuotaExhaustedError('google');
    }
    const badKey = response.status === 400 && /api.?key/.test(text);
    if (response.status === 401 || response.status === 403 || badKey) {
      throw new KeyRejectedError('google');
    }
    throw new NoRouteError();
  }
}

const seconds = (duration: string | undefined) => parseFloat(duration ?? '0') || 0;

const MANEUVERS: Record<string, [type: string, modifier: string]> = {
  DEPART: ['depart', ''],
  TURN_LEFT: ['turn', 'left'],
  TURN_RIGHT: ['turn', 'right'],
  TURN_SLIGHT_LEFT: ['turn', 'slight left'],
  TURN_SLIGHT_RIGHT: ['turn', 'slight right'],
  TURN_SHARP_LEFT: ['turn', 'sharp left'],
  TURN_SHARP_RIGHT: ['turn', 'sharp right'],
  UTURN_LEFT: ['turn', 'uturn'],
  UTURN_RIGHT: ['turn', 'uturn'],
  STRAIGHT: ['turn', 'straight'],
  NAME_CHANGE: ['new name', 'straight'],
  MERGE: ['merge', 'straight'],
  RAMP_LEFT: ['off ramp', 'left'],
  RAMP_RIGHT: ['off ramp', 'right'],
  FORK_LEFT: ['fork', 'left'],
  FORK_RIGHT: ['fork', 'right'],
  ROUNDABOUT_LEFT: ['roundabout', 'left'],
  ROUNDABOUT_RIGHT: ['roundabout', 'right'],
};

/** Reads an answer of the Routes API. */
export function routeFromGoogle(body: unknown): Route {
  const raw = (body as GoogleRoutes | null)?.routes?.[0];
  const points = raw?.polyline.geoJsonLinestring.coordinates ?? [];
  if (!raw || points.length < 2) throw new NoRouteError();
  const line = polyline(points);
  let last = 0;
  const steps: RouteStep[] = (raw.legs[0]?.steps ?? []).map((step) => {
    const at = step.startLocation?.latLng;
    if (at) {
      const { alongM } = snap(line, [at.longitude, at.latitude], { fromM: last, toM: Infinity });
      last = Math.max(last, alongM);
    }
    const { maneuver = 'STRAIGHT', instructions = '' } = step.navigationInstruction ?? {};
    const [type, modifier] = MANEUVERS[maneuver] ?? ['turn', 'straight'];
    return {
      maneuver: { type, modifier, exit: null },
      street: '',
      alongM: last,
      // Google puts extra notes on lines of their own.
      text: instructions.split('\n')[0],
    };
  });
  steps.push({
    maneuver: { type: 'arrive', modifier: '', exit: null },
    street: '',
    alongM: line.lengthM,
  });
  const duration = seconds(raw.duration);
  const congestion = (raw.travelAdvisory?.speedReadingIntervals ?? []).flatMap(
    (interval): Congestion[] => {
      if (interval.speed !== 'SLOW' && interval.speed !== 'TRAFFIC_JAM') return [];
      const from = interval.startPolylinePointIndex ?? 0;
      const to = interval.endPolylinePointIndex ?? points.length - 1;
      return [
        { level: interval.speed === 'SLOW' ? 'slow' : 'jam', points: points.slice(from, to + 1) },
      ];
    },
  );
  return {
    provider: 'google',
    line,
    durationS: duration,
    delayS: raw.staticDuration ? Math.max(0, duration - seconds(raw.staticDuration)) : 0,
    steps,
    congestion,
  };
}
