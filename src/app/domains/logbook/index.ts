/** Public API of the logbook domain. */
export { LogbookStore } from './application/logbook.store';
export { EcoTipHint } from './feature/eco-tip';
export { RoutineStore } from './application/routine.store';
export { RoutineHint } from './feature/routine-hint';
export type { Routine } from './domain/routine';
export { ecoScore } from './domain/trip';
export type { DrivingStyle, Trip } from './domain/trip';
export { provideLogbook } from './logbook.providers';
