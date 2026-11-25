import { Injectable, inject } from '@angular/core';
import { AdapterStore } from '../application/adapter.store';
import { AdapterUnknownError } from '../domain/adapter';
import { Elm327 } from '../domain/elm327';
import {
  FAST_KEYS,
  OBD_PIDS,
  PidKey,
  SLOW_KEYS,
  decodePidResponse,
  isPidSupported,
  parseAdapterVoltage,
} from '../domain/obd';
import { TelemetrySnapshot, TelemetrySource, TelemetryUpdate } from '../domain/telemetry';

/** After this many failed reads in a row a PID counts as unsupported. */
const MAX_FAILURES = 3;

/** Live data from the car through the chosen adapter. */
@Injectable()
export class ObdTelemetrySource extends TelemetrySource {
  private readonly adapters = inject(AdapterStore);
  private elm?: Elm327;
  /** Raised by every start and stop; an older run ends itself. */
  private run = 0;

  async start(onUpdate: (update: TelemetryUpdate) => void, onEnd: () => void): Promise<void> {
    const run = ++this.run;
    await this.elm?.close();
    this.elm = undefined;
    const { adapter } = this.adapters.settings();
    if (!adapter) throw new AdapterUnknownError();
    let started = false;
    const elm = await this.adapters.open(adapter, () => {
      if (started && run === this.run) onEnd();
    });
    if (run !== this.run) return elm.close();
    this.elm = elm;
    try {
      const { supportedPids } = await elm.initialize();
      started = true;
      void this.poll(elm, run, supportedPids, onUpdate);
    } catch (error) {
      await elm.close();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.run++;
    const elm = this.elm;
    this.elm = undefined;
    await elm?.close();
  }

  request(command: string, timeoutMs: number): Promise<string> {
    return this.elm ? this.elm.command(command, timeoutMs) : Promise.resolve('ERROR');
  }

  private async poll(
    elm: Elm327,
    run: number,
    supported: string,
    onUpdate: (update: TelemetryUpdate) => void,
  ): Promise<void> {
    const unsupported = new Set<PidKey>();
    const failures = new Map<PidKey, number>();
    const read = async (key: PidKey, into: Partial<TelemetrySnapshot>) => {
      const pid = OBD_PIDS[key];
      if (unsupported.has(key) || !isPidSupported(pid, supported)) return;
      const value = decodePidResponse(pid, await elm.command('01' + pid.code));
      if (value !== null) {
        into[key] = value;
        failures.set(key, 0);
        return;
      }
      const failed = (failures.get(key) ?? 0) + 1;
      failures.set(key, failed);
      if (failed >= MAX_FAILURES) {
        unsupported.add(key);
        if (key !== 'speed' && key !== 'rpm') into[key] = null;
      }
    };
    for (let cycle = 0; run === this.run && this.elm === elm; cycle++) {
      const started = performance.now();
      const values: Partial<TelemetrySnapshot> = {};
      for (const key of FAST_KEYS) await read(key, values);
      const slow = SLOW_KEYS[cycle % SLOW_KEYS.length];
      if (slow === 'voltage') {
        const voltage = parseAdapterVoltage(await elm.command('ATRV'));
        if (voltage !== null) values.voltage = voltage;
      } else {
        await read(slow, values);
      }
      if (run !== this.run || elm.isClosed) return;
      onUpdate({ values, rateHz: 1000 / Math.max(1, performance.now() - started) });
      // A link that answers at once (error) must not block the main thread.
      await new Promise((resolve) => setTimeout(resolve));
    }
  }
}
