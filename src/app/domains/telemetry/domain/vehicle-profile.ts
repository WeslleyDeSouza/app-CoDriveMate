export type FuelType = 'petrol' | 'diesel';

/**
 * Everything that differs between vehicles. Rules read these values instead
 * of assuming a specific car, so a new vehicle is a new profile, not new code.
 */
export interface VehicleProfile {
  readonly name: string;
  readonly fuelType: FuelType;
  /** engine displacement in litres */
  readonly displacementL: number;
  /** tank size in litres, if known */
  readonly tankL: number | null;
  /** rpm where the red zone begins */
  readonly redlineRpm: number;
  /** highest rpm shown on the gauge */
  readonly maxRpm: number;
  /** km/h per 1000 rpm in each gear, empty if unknown */
  readonly gearRatios: readonly number[];
}

export const XSARA_PICASSO: VehicleProfile = {
  name: 'Citroën Xsara Picasso',
  fuelType: 'petrol',
  displacementL: 1.8,
  tankL: 55,
  redlineRpm: 6000,
  maxRpm: 7000,
  gearRatios: [7.5, 13.5, 19.5, 26, 33],
};
