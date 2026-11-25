/** Public API of the telemetry domain. Other code imports only from here. */
export { DEMO_ENABLED, TelemetryStore } from './application/telemetry.store';
export { emptySnapshot } from './domain/telemetry';
export type { TelemetryKey, TelemetryMode, TelemetrySnapshot } from './domain/telemetry';
export { XSARA_PICASSO } from './domain/vehicle-profile';
export type { FuelType, VehicleProfile } from './domain/vehicle-profile';
export { ObdSettings } from './feature/obd-settings';
export type { CockpitExtras } from './feature/cockpit-panel';
export { CockpitPanel } from './feature/cockpit-panel';
export { SpeedGauge } from './feature/speed-gauge';
export { provideTelemetry } from './telemetry.providers';
