import { inject } from '@angular/core';
import { AssistantTool } from '@core/assistant';
import { TranslateService } from '@core/i18n';
import { NavigationStore } from './navigation.store';

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
