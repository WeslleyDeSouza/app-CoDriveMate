import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { AdapterStore } from '../application/adapter.store';
import { AdapterRef } from '../domain/adapter';
import {
  DEFAULT_WIFI_ENDPOINT,
  parseHost,
  parsePort,
  wifiAdapter,
  wifiEndpoint,
} from '../domain/wifi-adapter';

/** Address of a WiFi adapter. */
@Component({
  selector: 'app-obd-wifi-form',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fields">
      <label class="f">
        {{ 'telemetry.obd.wifi.host' | translate }}
        <input
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          data-section-test="obd-wifi-host"
          [value]="hostText()"
          [attr.aria-invalid]="host() === null"
          (input)="edit(hostText, $any($event.target).value)"
        />
      </label>
      <label class="f">
        {{ 'telemetry.obd.wifi.port' | translate }}
        <input
          type="text"
          inputmode="numeric"
          autocomplete="off"
          data-section-test="obd-wifi-port"
          [value]="portText()"
          [attr.aria-invalid]="port() === null"
          (input)="edit(portText, $any($event.target).value)"
        />
      </label>
    </div>
    @if (host() === null) {
      <p class="lv-overdue" role="alert" data-section-test="obd-wifi-host-error">
        {{ 'telemetry.obd.wifi.host_invalid' | translate }}
      </p>
    }
    @if (port() === null) {
      <p class="lv-overdue" role="alert" data-section-test="obd-wifi-port-error">
        {{ 'telemetry.obd.wifi.port_invalid' | translate }}
      </p>
    }
    <button
      class="btn"
      type="button"
      data-section-test="obd-wifi-use"
      [disabled]="!adapter()"
      (click)="use()"
    >
      <i class="ti ti-check" aria-hidden="true"></i>
      {{ 'telemetry.obd.wifi.use' | translate }}
    </button>
  `,
  styles: `
    .fields {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 10px;
      margin-bottom: 14px;
    }
    p {
      font-size: 14px;
      margin-bottom: 14px;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
  `,
})
export class ObdWifiForm {
  private readonly store = inject(AdapterStore);
  /** Takes the typed address. */
  readonly chosen = output<AdapterRef>();
  /** The typed address no longer is the one that was taken. */
  readonly changed = output<void>();

  protected readonly hostText = signal(DEFAULT_WIFI_ENDPOINT.host);
  protected readonly portText = signal(String(DEFAULT_WIFI_ENDPOINT.port));
  protected readonly host = computed(() => parseHost(this.hostText()));
  protected readonly port = computed(() => parsePort(this.portText()));
  protected readonly adapter = computed(() => {
    const host = this.host();
    const port = this.port();
    return host === null || port === null ? null : wifiAdapter({ host, port });
  });

  constructor() {
    const { adapter } = this.store.settings();
    if (adapter?.kind === 'wifi') {
      const { host, port } = wifiEndpoint(adapter);
      this.hostText.set(host);
      this.portText.set(String(port));
    }
  }

  protected edit(field: typeof this.hostText, text: string): void {
    field.set(text);
    this.changed.emit();
  }

  protected use(): void {
    const adapter = this.adapter();
    if (adapter) this.chosen.emit(adapter);
  }
}
