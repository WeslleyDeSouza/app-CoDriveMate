import { Injectable } from '@angular/core';
import { TelemetrySource, TelemetryUpdate } from '../domain/telemetry';

const TICK_MS = 200;
/** km/h per 1000 rpm in gears 1-5, roughly a 1.8 l petrol family car. */
const GEAR_SPEED_PER_1000_RPM = [8, 14, 21, 28, 35];

/** A simulated drive, so the app can be shown and developed without a car. */
@Injectable()
export class DemoTelemetrySource extends TelemetrySource {
  private timer?: ReturnType<typeof setInterval>;

  async start(onUpdate: (update: TelemetryUpdate) => void): Promise<void> {
    await this.stop();
    let t = 0;
    let coolant = 40;
    const fault = new URLSearchParams(globalThis.location?.search ?? '').get('fault');
    this.timer = setInterval(() => {
      t += TICK_MS / 1000;
      // Gentle speed waves between standstill and ~110 km/h.
      const speed = Math.max(0, 55 + 50 * Math.sin(t / 14) + 12 * Math.sin(t / 3.1));
      const gear =
        GEAR_SPEED_PER_1000_RPM.findIndex((perThousand) => speed / perThousand < 3.2) + 1 || 5;
      const rpm = speed < 3 ? 850 : (speed / GEAR_SPEED_PER_1000_RPM[gear - 1]) * 1000;
      const throttle = Math.max(0, Math.min(100, 22 + 30 * Math.cos(t / 14) + 8 * Math.sin(t / 2)));
      coolant = Math.min(fault === 'cool' ? 108 : 90, coolant + (fault === 'cool' ? 0.5 : 0.05));
      onUpdate({
        rateHz: 1000 / TICK_MS,
        values: {
          speed: Math.round(speed),
          rpm: Math.round(rpm),
          throttle,
          load: Math.min(100, throttle * 1.1 + 10),
          manifoldPressure: 30 + throttle * 0.65,
          massAirFlow: 2.5 + (rpm / 1000) * (throttle / 100) * 14,
          coolantTemp: Math.round(coolant),
          intakeTemp: 24,
          voltage: fault === 'volt' ? 12.1 : 13.9,
          fuelLevel: fault === 'fuel' ? 9 : 62,
        },
      });
    }, TICK_MS);
  }

  private cleared = false;
  async request(command: string): Promise<string> {
    const fault = new URLSearchParams(globalThis.location?.search ?? '').get('fault');
    if (command === '04') this.cleared = true;
    const lamp = fault === 'mil' && !this.cleared;
    if (command === '0101') return lamp ? '41 01 81 07 65 04' : '41 01 00 07 65 04';
    if (command === '03') return this.cleared ? '43 00 00 00 00 00 00' : '43 01 71 00 00 00 00';
    return command === '04' ? '44' : 'NO DATA';
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
