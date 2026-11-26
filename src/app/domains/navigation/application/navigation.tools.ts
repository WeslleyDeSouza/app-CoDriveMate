import { inject } from '@angular/core';
import { AssistantTool } from '@core/assistant';
import { TranslateService } from '@core/i18n';
import { WEEKDAYS, spokenDay } from '../domain/planned-trips';
import { NavigationStore } from './navigation.store';
import { PlacesStore } from './places.store';
import { PlannedTripsStore } from './planned-trips.store';

/** The copilot sets a destination; the route starts only after the driver's yes. */
export function destinationTool(): AssistantTool {
  const navigation = inject(NavigationStore);
  const translate = inject(TranslateService);
  return {
    name: 'set_destination',
    description:
      'Finds a place (address, town, business or point of interest) and starts the route ' +
      'there after the driver confirmed it.',
    input: {
      properties: {
        query: { type: 'string', description: 'What to search for, e.g. "Fitnesspark Zürich"' },
      },
      required: ['query'],
    },
    async run(input, { confirm }) {
      const query = String(input['query'] ?? '').trim();
      if (!query) return 'No place given.';
      const [place] = await navigation.search(query).catch(() => []);
      if (!place) return `Nothing found for "${query}".`;
      const where = [place.name, place.detail].filter(Boolean).join(', ');
      const question =
        translate.translate('navigation.tool.confirm', { place: place.name }) ?? place.name;
      if (!(await confirm(question))) return `The driver did not want the route to ${where}.`;
      const started = await navigation.navigateTo(place);
      if (!started) return `No route to ${where} could be calculated.`;
      const route = navigation.route();
      const minutes = route ? Math.round(route.durationS / 60) : null;
      return `Route to ${where} started${minutes === null ? '' : `, about ${minutes} min`}.`;
    },
  };
}

/** The copilot saves a destination for later, with what it is about, after the driver's yes. */
export function planTripTool(): AssistantTool {
  const navigation = inject(NavigationStore);
  const places = inject(PlacesStore);
  const trips = inject(PlannedTripsStore);
  const translate = inject(TranslateService);
  return {
    name: 'plan_trip',
    description:
      'Saves a destination for later with a topic and a note, optionally for a day, when the ' +
      'driver asks for it (e.g. "remember the indoor pool for Saturday, swimming"). The ' +
      'conversation later knows the reason of that drive. Does not start a route.',
    input: {
      properties: {
        query: {
          type: 'string',
          description: 'The place to search for, e.g. "Hallenbad Oerlikon"',
        },
        topic: {
          type: 'string',
          description: 'Short reason in the driver\'s words, e.g. "Schwimmen"',
        },
        note: {
          type: 'string',
          description: 'Anything else the driver said about it; may be empty',
        },
        weekday: {
          type: 'string',
          enum: [...WEEKDAYS],
          description: 'If the driver named a weekday; the next such day, today included',
        },
        days_from_today: {
          type: 'integer',
          minimum: 0,
          description: 'If the driver said today (0), tomorrow (1) or in some days',
        },
        favourite: { type: 'boolean', description: 'If the driver wants it as a favourite' },
      },
      required: ['query'],
    },
    async run(input, { confirm }) {
      const query = String(input['query'] ?? '').trim();
      if (!query) return 'No place given.';
      const [found] = await navigation.search(query).catch(() => []);
      if (!found) return `Nothing found for "${query}".`;
      const where = [found.name, found.detail].filter(Boolean).join(', ');
      const weekday = typeof input['weekday'] === 'string' ? input['weekday'] : undefined;
      const ahead =
        typeof input['days_from_today'] === 'number' ? input['days_from_today'] : undefined;
      const day = spokenDay(Date.now(), weekday, ahead);
      const lang = translate.lang === 'de' ? 'de-CH' : translate.lang;
      const when = day
        ? new Date(`${day}T12:00:00`).toLocaleDateString(lang, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })
        : '';
      const key = day ? 'navigation.tool.plan_confirm' : 'navigation.tool.plan_confirm_any';
      const question = translate.translate(key, { place: found.name, when }) ?? found.name;
      if (!(await confirm(question))) return `The driver did not want to save ${where}.`;
      const trip = await trips.save({
        place: await places.forLater(found),
        topic: String(input['topic'] ?? ''),
        note: String(input['note'] ?? ''),
        day: day ?? '',
        favourite: input['favourite'] === true,
      });
      if (!trip) return 'Saving did not work.';
      const saved = day ? `for ${day}` : 'for any day';
      return `Saved ${where} ${saved}${trip.favourite ? ' as favourite' : ''}; topic "${trip.topic}".`;
    },
  };
}
