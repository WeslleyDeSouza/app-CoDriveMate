import { BleOffError, BlePermissionError, BleUnavailableError } from '@core/bluetooth';
import { AdapterUnknownError } from '../domain/adapter';
import { NoEcuError } from '../domain/elm327';

/** Translation key for a failed connection, '' for none. */
export function obdErrorKey(error: unknown): string {
  if (!error) return '';
  if (error instanceof BlePermissionError) return 'telemetry.obd.error.permission';
  if (error instanceof BleOffError) return 'telemetry.obd.error.off';
  if (error instanceof BleUnavailableError) return 'telemetry.obd.error.bluetooth';
  if (error instanceof AdapterUnknownError) return 'telemetry.obd.error.unknown';
  if (error instanceof NoEcuError) return 'telemetry.obd.error.ecu';
  // Closing the picker is a decision, not a failure.
  if (/cancel/i.test(String((error as Error).message ?? error))) return '';
  return 'telemetry.obd.error.other';
}

/** Whether the device settings can solve it. */
export function needsSettings(error: unknown): boolean {
  return error instanceof BlePermissionError;
}
