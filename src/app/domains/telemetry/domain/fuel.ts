import { TelemetrySnapshot } from './telemetry';
import { FuelType, VehicleProfile } from './vehicle-profile';

/** Stoichiometric air/fuel ratio and density (g/l) per fuel. */
const FUEL: Record<FuelType, { airFuelRatio: number; densityGPerL: number }> = {
  petrol: { airFuelRatio: 14.7, densityGPerL: 745 },
  diesel: { airFuelRatio: 14.5, densityGPerL: 832 },
};

/** Share of the cylinder that actually fills with air; a typical value for older engines. */
const VOLUMETRIC_EFFICIENCY = 0.8;
const GAS_CONSTANT_AIR = 287.05;
/** Below this speed a per-distance figure is meaningless (idling, creeping). */
const MIN_SPEED_FOR_PER_100KM = 5;

/**
 * Air mass flow in g/s: from the MAF sensor if the car has one, otherwise
 * estimated from manifold pressure, rpm and intake temperature (speed-density).
 */
export function airMassFlow(
  values: Pick<TelemetrySnapshot, 'massAirFlow' | 'manifoldPressure' | 'intakeTemp' | 'rpm'>,
  profile: VehicleProfile,
): number | null {
  if (values.massAirFlow !== null) return values.massAirFlow;
  if (values.manifoldPressure === null || values.rpm <= 0) return null;
  const kelvin = (values.intakeTemp ?? 20) + 273.15;
  const densityGPerL = (values.manifoldPressure * 1000) / (GAS_CONSTANT_AIR * kelvin);
  const intakeLitresPerSecond = (values.rpm / 120) * profile.displacementL;
  return intakeLitresPerSecond * densityGPerL * VOLUMETRIC_EFFICIENCY;
}

/** Current fuel flow in l/h, null if the car delivers no usable air data. */
export function fuelRateLph(
  values: Pick<TelemetrySnapshot, 'massAirFlow' | 'manifoldPressure' | 'intakeTemp' | 'rpm'>,
  profile: VehicleProfile,
): number | null {
  const air = airMassFlow(values, profile);
  if (air === null) return null;
  const { airFuelRatio, densityGPerL } = FUEL[profile.fuelType];
  return (air * 3600) / (airFuelRatio * densityGPerL);
}

/** Current consumption in l/100 km, null while standing or crawling. */
export function consumptionPer100Km(rateLph: number | null, speedKmh: number): number | null {
  if (rateLph === null || speedKmh < MIN_SPEED_FOR_PER_100KM) return null;
  return (rateLph / speedKmh) * 100;
}

/** Remaining range in km from tank level and an average consumption. */
export function rangeKm(
  fuelLevelPercent: number | null,
  averagePer100Km: number | null,
  profile: VehicleProfile,
): number | null {
  if (fuelLevelPercent === null || profile.tankL === null) return null;
  if (averagePer100Km === null || averagePer100Km <= 0) return null;
  return (((fuelLevelPercent / 100) * profile.tankL) / averagePer100Km) * 100;
}
