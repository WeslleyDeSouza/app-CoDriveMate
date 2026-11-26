import { inject } from '@angular/core';
import { AssistantTool } from '@core/assistant';
import { FuelStore } from './fuel.store';

const LISTED = 3;

/** The copilot looks for filling stations; the list and the map show them too. */
export function fuelTool(): AssistantTool {
  const fuel = inject(FuelStore);
  return {
    name: 'find_fuel',
    description:
      'Looks for filling stations along the active route, or near the car without one, and ' +
      'shows them on the map. Gives the nearest with distance and whether they are open. ' +
      'To drive to one, use set_destination with its name and address.',
    input: { properties: {} },
    async run() {
      const scope = fuel.hasRoute() ? 'route' : 'near';
      await fuel.search(scope);
      const stations = [...fuel.stations()].sort((a, b) => a.distanceM - b.distanceM);
      if (!stations.length) {
        return fuel.state() === 'no_position'
          ? 'The position of the car is not known yet.'
          : 'No filling station found.';
      }
      const listed = stations.slice(0, LISTED).map(({ name, address, distanceM, open }) => {
        const state = open === null ? '' : open ? ', open' : ', closed';
        return `${name || 'filling station'} (${address || 'no address'}), ${(distanceM / 1000).toFixed(1)} km${state}`;
      });
      const range = fuel.rangeKm();
      const left = range === null ? '' : ` Range left: about ${Math.round(range)} km.`;
      return `${stations.length} found ${scope === 'route' ? 'along the route' : 'nearby'}: ${listed.join('; ')}.${left}`;
    },
  };
}
