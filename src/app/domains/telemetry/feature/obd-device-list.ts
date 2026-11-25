import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { AdapterStore } from '../application/adapter.store';
import { AdapterRef, FoundAdapter } from '../domain/adapter';
import { addFound } from '../domain/adapter-match';

const SCAN_MS = 30_000;

/** Bluetooth devices around, those that look like an OBD adapter first. */
@Component({
  selector: 'app-obd-device-list',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      class="btn"
      type="button"
      data-section-test="obd-scan"
      [disabled]="scanning()"
      (click)="start()"
    >
      <i class="ti ti-search" aria-hidden="true"></i>
      {{ (scanning() ? 'telemetry.obd.scanning' : 'telemetry.obd.search') | translate }}
    </button>
    <ul>
      @for (item of shown(); track item.adapter.id) {
        <li>
          <button
            type="button"
            [class]="item.match"
            [attr.data-section-test]="'obd-device-' + $index"
            (click)="choose(item.adapter)"
          >
            <i class="ti ti-bluetooth" aria-hidden="true"></i>
            <span>
              <b>{{ item.adapter.name || ('telemetry.obd.unnamed' | translate) }}</b>
              <small>{{ 'telemetry.obd.match.' + item.match | translate }}</small>
            </span>
            @if (item.rssi !== null) {
              <em>{{ item.rssi }} dBm</em>
            }
          </button>
        </li>
      }
    </ul>
    @if (hiddenCount() > 0) {
      <button class="btn" type="button" data-section-test="obd-scan-all" (click)="all.set(true)">
        {{ 'telemetry.obd.show_all' | translate }} ({{ hiddenCount() }})
      </button>
    }
    @if (searched() && !scanning() && !found().length) {
      <p role="status" data-section-test="obd-scan-empty">
        {{ 'telemetry.obd.scan_empty' | translate }}
      </p>
    }
  `,
  styles: `
    ul {
      list-style: none;
      display: grid;
      gap: 8px;
      margin: 12px 0;
    }
    li button {
      width: 100%;
      min-height: 60px;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 14px;
      border: 2px solid transparent;
      border-radius: 16px;
      background: var(--p2);
      text-align: left;

      i {
        font-size: 24px;
        color: var(--s);
      }
      span {
        flex: 1;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      small {
        display: block;
        color: var(--s);
        font-size: 13px;
      }
      em {
        color: var(--s);
        font-size: 13px;
        font-style: normal;
      }
    }
    li .likely {
      border-color: var(--ok);

      i,
      small {
        color: var(--ok);
      }
    }
    p {
      color: var(--s);
      font-size: 14px;
    }
  `,
})
export class ObdDeviceList {
  readonly chosen = output<AdapterRef>();
  readonly failed = output<unknown>();
  private readonly adapters = inject(AdapterStore);
  protected readonly found = signal<readonly FoundAdapter[]>([]);
  protected readonly scanning = signal(false);
  protected readonly searched = signal(false);
  protected readonly all = signal(false);
  protected readonly shown = computed(() =>
    this.all() ? this.found() : this.found().filter(({ match }) => match !== 'unknown'),
  );
  protected readonly hiddenCount = computed(() => this.found().length - this.shown().length);
  private stopScan?: () => Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop();
    });
  }

  protected async start(): Promise<void> {
    this.found.set([]);
    this.scanning.set(true);
    this.failed.emit(null);
    try {
      this.stopScan = await this.adapters.scan('ble', (item) =>
        this.found.update((list) => addFound(list, item)),
      );
      this.searched.set(true);
      if (this.destroyed) this.stop();
      else this.timer = setTimeout(() => this.stop(), SCAN_MS);
    } catch (error) {
      this.scanning.set(false);
      if (!this.destroyed) this.failed.emit(error);
    }
  }

  protected choose(adapter: AdapterRef): void {
    this.stop();
    this.chosen.emit({ ...adapter, name: adapter.name || 'OBD' });
  }

  private stop(): void {
    clearTimeout(this.timer);
    this.scanning.set(false);
    void this.stopScan?.().catch(() => undefined);
    this.stopScan = undefined;
  }
}
