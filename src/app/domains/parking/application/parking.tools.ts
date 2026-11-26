import { inject } from '@angular/core';
import { AssistantTool } from '@core/assistant';
import { ParkingStore } from './parking.store';

/** The copilot remembers where the car is parked. */
export function parkingTool(): AssistantTool {
  const parking = inject(ParkingStore);
  return {
    name: 'remember_parking',
    description: 'Remembers the present position of the car as its parking spot.',
    input: { properties: {} },
    async run() {
      return (await parking.parkHere())
        ? 'Parking spot saved.'
        : 'The position of the car is not known yet.';
    },
  };
}
