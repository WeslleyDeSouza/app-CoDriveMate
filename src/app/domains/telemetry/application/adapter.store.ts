import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import {
  AdapterKind,
  AdapterLink,
  AdapterRef,
  AdapterRepository,
  AdapterSettings,
  AdapterUnknownError,
  DEFAULT_ADAPTER_SETTINGS,
  FoundAdapter,
  TEST_STEPS,
  TestStep,
  TestStepId,
} from '../domain/adapter';
import { Elm327 } from '../domain/elm327';
import { OBD_PIDS, PidKey, decodePidResponse, parseAdapterVoltage } from '../domain/obd';

export const ADAPTER_LINKS = new InjectionToken<AdapterLink[]>('ADAPTER_LINKS');

const PROBED: readonly PidKey[] = ['rpm', 'speed', 'coolantTemp', 'load', 'throttle'];

/** The chosen OBD adapter, its options and the connection test. */
@Injectable({ providedIn: 'root' })
export class AdapterStore {
  private readonly links = inject(ADAPTER_LINKS).flat();
  private readonly repository = inject(AdapterRepository);
  private readonly _settings = signal<AdapterSettings>(DEFAULT_ADAPTER_SETTINGS);
  private readonly _steps = signal<readonly TestStep[]>([]);
  private readonly _testing = signal(false);
  private loading?: Promise<void>;

  readonly settings = this._settings.asReadonly();
  readonly steps = this._steps.asReadonly();
  readonly testing = this._testing.asReadonly();

  load(): Promise<void> {
    this.loading ??= this.repository
      .load()
      .then((settings) => this._settings.set(settings))
      .catch((error: unknown) => console.warn('Loading the adapter failed', error));
    return this.loading;
  }

  supports(kind: AdapterKind): boolean {
    return this.links.some((link) => link.kind === kind);
  }

  /** Lets the user pick an adapter and remembers it. */
  async choose(kind: AdapterKind): Promise<AdapterRef> {
    const adapter = await this.link(kind).choose();
    await this.select(adapter);
    return adapter;
  }

  /** Remembers an adapter that needs no picker. */
  async select(adapter: AdapterRef): Promise<void> {
    await this.load();
    this._steps.set([]);
    await this.change({ adapter });
  }

  /** Adapters of a kind that the system has connected already. */
  async connected(kind: AdapterKind): Promise<readonly AdapterRef[]> {
    return this.link(kind).connected();
  }

  canScan(kind: AdapterKind): boolean {
    return this.supports(kind) && this.link(kind).canScan();
  }

  scan(kind: AdapterKind, onFound: (found: FoundAdapter) => void): Promise<() => Promise<void>> {
    return this.link(kind).scan(onFound);
  }

  /** The error that stopped the last test. */
  readonly testError = signal<unknown>(null);

  openSettings(): void {
    const kind = this._settings().adapter?.kind ?? 'ble';
    void this.link(kind)
      .openSettings()
      .catch(() => false);
  }

  async forget(): Promise<void> {
    await this.load();
    this._steps.set([]);
    await this.change({ adapter: null, autoConnect: false });
  }

  async setAutoConnect(autoConnect: boolean): Promise<void> {
    await this.load();
    await this.change({ autoConnect });
  }

  open(adapter: AdapterRef, onClose: () => void): Promise<Elm327> {
    // Stored on another device: trying again cannot help here.
    if (!this.supports(adapter.kind)) throw new AdapterUnknownError();
    return Elm327.connect(this.link(adapter.kind), adapter, onClose);
  }

  /** Checks the way to the engine step by step. True if live data can be read. */
  async test(): Promise<boolean> {
    await this.load();
    const { adapter } = this._settings();
    if (!adapter || this._testing()) return false;
    this._testing.set(true);
    this.testError.set(null);
    this._steps.set(TEST_STEPS.map((id) => ({ id, state: 'waiting', detail: '' })));
    let elm: Elm327 | undefined;
    try {
      const opened = (elm = await this.step('connect', async () => {
        const connection = await this.open(adapter, () => undefined);
        return { value: connection, detail: adapter.name };
      }));
      await this.step('adapter', async () => {
        const version = await opened.command('ATI', 5000);
        if (/^(TIMEOUT|ERROR|\?|)$/.test(version)) throw new Error(version);
        return { value: undefined, detail: version.split(/[\r\n]+/).pop() ?? '' };
      });
      // Not every adapter measures the voltage; that does not stop the test.
      await this.step('voltage', async () => {
        const volts = parseAdapterVoltage(await opened.command('ATRV'));
        if (volts === null) throw new Error('no voltage');
        return { value: undefined, detail: volts.toFixed(1) + ' V' };
      }).catch(() => undefined);
      await this.step('ecu', async () => {
        const { protocol } = await opened.initialize();
        return { value: undefined, detail: protocol };
      });
      await this.step('values', async () => {
        let found = 0;
        for (const key of PROBED) {
          const answer = await opened.command('01' + OBD_PIDS[key].code);
          if (decodePidResponse(OBD_PIDS[key], answer) !== null) found++;
        }
        if (!found) throw new Error('no values');
        return { value: undefined, detail: `${found}/${PROBED.length}` };
      });
      return true;
    } catch (error) {
      console.warn('Adapter test stopped', error);
      this.testError.set(error);
      this._steps.update((steps) =>
        steps.map((step) => (step.state === 'waiting' ? { ...step, state: 'skipped' } : step)),
      );
      return false;
    } finally {
      await elm?.close();
      this._testing.set(false);
    }
  }

  private async step<T>(
    id: TestStepId,
    action: () => Promise<{ value: T; detail: string }>,
  ): Promise<T> {
    this.mark(id, 'running', '');
    try {
      const { value, detail } = await action();
      this.mark(id, 'ok', detail);
      return value;
    } catch (error) {
      this.mark(id, 'failed', '');
      throw error;
    }
  }

  private mark(id: TestStepId, state: TestStep['state'], detail: string): void {
    this._steps.update((steps) =>
      steps.map((step) => (step.id === id ? { id, state, detail } : step)),
    );
  }

  private link(kind: AdapterKind): AdapterLink {
    const link = this.links.find((candidate) => candidate.kind === kind);
    if (!link) throw new Error(`Adapters of kind "${kind}" are not available here.`);
    return link;
  }

  private async change(change: Partial<AdapterSettings>): Promise<void> {
    const next = { ...this._settings(), ...change };
    this._settings.set(next);
    await this.repository.save(next);
  }
}
