import { FoundAdapter } from './adapter';

/** 'likely': named like an OBD adapter, 'maybe': offers a serial service many gadgets use. */
export type AdapterMatch = 'likely' | 'maybe' | 'unknown';

const NAMES =
  /obd|elm ?327|v-?link|vgate|icar|veepeak|viecar|carista|konnwei|kingbolen|lelink|ios-v/i;
const RANK: Record<AdapterMatch, number> = { likely: 0, maybe: 1, unknown: 2 };
const MIN_RSSI = -127;

/** Guesses from the advertisement whether a device is an OBD adapter. */
export function matchAdapter(
  name: string | undefined,
  services: readonly string[],
  serialServices: readonly string[],
): AdapterMatch {
  if (name && NAMES.test(name)) return 'likely';
  return services.some((service) => serialServices.includes(service.toLowerCase()))
    ? 'maybe'
    : 'unknown';
}

/** Adds or updates a device; what fits best and is nearest comes first. */
export function addFound(
  list: readonly FoundAdapter[],
  found: FoundAdapter,
): readonly FoundAdapter[] {
  const known = list.find(({ adapter }) => adapter.id === found.adapter.id);
  // Later advertisements may lack name or services.
  const merged = known
    ? {
        adapter: found.adapter.name ? found.adapter : known.adapter,
        match: RANK[found.match] < RANK[known.match] ? found.match : known.match,
        rssi: found.rssi ?? known.rssi,
      }
    : found;
  return [...list.filter((one) => one !== known), merged].sort(
    (a, b) => RANK[a.match] - RANK[b.match] || (b.rssi ?? MIN_RSSI) - (a.rssi ?? MIN_RSSI),
  );
}
