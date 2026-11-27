import { inject } from '@angular/core';
import { AssistantTool } from '@core/assistant';
import { REMIND_BEFORE_MS } from '../domain/parking';
import { ParkingStore } from './parking.store';

const MAX_MINUTES = 720;
const REMIND_BEFORE_MIN = REMIND_BEFORE_MS / 60_000;

/** The copilot sets the parking meter; the reminders follow as from the page. */
export function parkingTimerTool(): AssistantTool {
  const parking = inject(ParkingStore);
  return {
    name: 'set_parking_timer',
    description:
      'Sets the parking meter of the saved parking spot to a number of minutes from now and ' +
      'reminds the driver before it runs out. 0 switches the meter off. Needs a saved ' +
      'parking spot (remember_parking).',
    input: {
      properties: { minutes: { type: 'integer', minimum: 0, maximum: MAX_MINUTES } },
      required: ['minutes'],
    },
    async run(input) {
      const minutes = input['minutes'];
      if (
        typeof minutes !== 'number' ||
        !Number.isInteger(minutes) ||
        minutes < 0 ||
        minutes > MAX_MINUTES
      ) {
        return `The minutes must be a whole number from 0 to ${MAX_MINUTES}.`;
      }
      await parking.start();
      if (!parking.spot()) return 'No parking spot is saved yet. Use remember_parking first.';
      await parking.setMeter(minutes);
      if (!minutes) return 'Parking meter switched off.';
      const set = `Parking meter set to ${minutes} minutes.`;
      if (parking.silent()) {
        return `${set} Reminders only come while the app is open; notifications are not allowed or not possible here.`;
      }
      return minutes > REMIND_BEFORE_MIN
        ? `${set} Reminders come ${REMIND_BEFORE_MIN} minutes before the end and at the end.`
        : `${set} A reminder comes at the end.`;
    },
  };
}

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
