import { Provider } from '@angular/core';
import { ADAPTER_LINKS } from './application/adapter.store';
import { DEMO_TELEMETRY_SOURCE, OBD_TELEMETRY_SOURCE } from './application/telemetry.store';
import {
  AdapterConnection,
  AdapterLink,
  AdapterRef,
  AdapterRepository,
  AdapterSettings,
  DEFAULT_ADAPTER_SETTINGS,
} from './domain/adapter';
import { TelemetrySnapshot, TelemetrySource, TelemetryUpdate } from './domain/telemetry';

/** Telemetry source for unit tests: the test decides when data arrives. */
export class FakeTelemetrySource extends TelemetrySource {
  started = 0;
  stopped = 0;
  /** Replace to keep `start()` pending (connecting) or to make it fail. */
  startResult: Promise<void> = Promise.resolve();

  private onUpdate?: (update: TelemetryUpdate) => void;
  private onEnd?: () => void;

  override async start(
    onUpdate: (update: TelemetryUpdate) => void,
    onEnd: () => void,
  ): Promise<void> {
    this.started++;
    this.onUpdate = onUpdate;
    this.onEnd = onEnd;
    await this.startResult;
  }

  override async stop(): Promise<void> {
    this.stopped++;
  }

  answers: Record<string, string> = {};
  readonly requested: string[] = [];
  override async request(command: string): Promise<string> {
    this.requested.push(command);
    return this.answers[command] ?? 'NO DATA';
  }

  emit(values: Partial<TelemetrySnapshot>, rateHz?: number): void {
    this.onUpdate?.({ values, rateHz });
  }

  /** The source stops on its own, e.g. the adapter was unplugged. */
  end(): void {
    this.onEnd?.();
  }
}

export const TEST_ADAPTER: AdapterRef = { kind: 'ble', id: 'a1', name: 'Vgate' };

/** A BLE adapter that answers from a table of commands. */
export class FakeAdapterLink extends AdapterLink {
  readonly kind = 'ble' as const;
  chosen = 0;
  opened = 0;
  closed = 0;
  chooseError?: Error;
  openError?: Error;
  answers: Record<string, string> = {};
  readonly sent: string[] = [];
  drop: () => void = () => undefined;

  settingsOpened = 0;
  async openSettings(): Promise<boolean> {
    this.settingsOpened++;
    return true;
  }

  async choose(): Promise<AdapterRef> {
    this.chosen++;
    if (this.chooseError) throw this.chooseError;
    return TEST_ADAPTER;
  }

  async open(
    _adapter: AdapterRef,
    onData: (data: Uint8Array) => void,
    onClose: () => void,
  ): Promise<AdapterConnection> {
    this.opened++;
    this.drop = onClose;
    if (this.openError) throw this.openError;
    return {
      write: async (data) => {
        const command = new TextDecoder().decode(data).trim();
        this.sent.push(command);
        const answer = (this.answers[command] ?? 'OK') + '\r\r>';
        queueMicrotask(() => onData(new TextEncoder().encode(answer)));
      },
      close: async () => void this.closed++,
    };
  }
}

export class FakeAdapterRepository extends AdapterRepository {
  stored: AdapterSettings = DEFAULT_ADAPTER_SETTINGS;
  async load(): Promise<AdapterSettings> {
    return this.stored;
  }
  async save(settings: AdapterSettings): Promise<void> {
    this.stored = settings;
  }
}

export interface TelemetryTesting {
  readonly obd: FakeTelemetrySource;
  readonly demo: FakeTelemetrySource;
  readonly link: FakeAdapterLink;
  readonly adapters: FakeAdapterRepository;
  readonly providers: Provider[];
}

/** The real stores on top of two controllable sources and a fake adapter. */
export function telemetryTesting(): TelemetryTesting {
  const obd = new FakeTelemetrySource();
  const demo = new FakeTelemetrySource();
  const link = new FakeAdapterLink();
  const adapters = new FakeAdapterRepository();
  return {
    obd,
    demo,
    link,
    adapters,
    providers: [
      { provide: OBD_TELEMETRY_SOURCE, useValue: obd },
      { provide: DEMO_TELEMETRY_SOURCE, useValue: demo },
      { provide: ADAPTER_LINKS, useValue: link, multi: true },
      { provide: AdapterRepository, useValue: adapters },
    ],
  };
}
