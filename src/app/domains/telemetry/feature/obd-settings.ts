import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@core/i18n';
import { AdapterStore } from '../application/adapter.store';
import { TelemetryStore } from '../application/telemetry.store';
import { AdapterTest } from './adapter-test';
import { KIND_ICONS } from './kind-icons';
import { needsSettings, obdErrorKey } from './obd-error';

/** The OBD adapter in the settings. Changes apply at once, without "Save". */
@Component({
  selector: 'app-obd-settings',
  imports: [AdapterTest, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (adapter(); as a) {
      <p class="current">
        <i class="ti" [class]="'ti-' + icons[a.kind]" aria-hidden="true"></i>
        <span>
          <b data-section-test="obd-adapter">{{ a.name }}</b>
          <small data-section-test="obd-mode">
            {{ 'telemetry.obd.kind.' + a.kind | translate }} ·
            {{ 'telemetry.mode.' + telemetry.mode() | translate }}
          </small>
        </span>
      </p>
      @if (errorKey(); as key) {
        <p class="note lv-overdue" role="alert" data-section-test="obd-error">
          {{ key | translate }}
        </p>
        @if (needsSettings()) {
          <button
            class="btn"
            type="button"
            data-section-test="obd-open-settings"
            (click)="adapters.openSettings()"
          >
            <i class="ti ti-settings" aria-hidden="true"></i>
            {{ 'telemetry.obd.open_settings' | translate }}
          </button>
        }
      }
      <label class="check">
        <input
          type="checkbox"
          data-section-test="obd-auto"
          [checked]="adapters.settings().autoConnect"
          (change)="adapters.setAutoConnect($any($event.target).checked)"
        />
        {{ 'telemetry.obd.auto' | translate }}
      </label>
      <div class="row">
        <button
          class="btn pri"
          type="button"
          data-section-test="obd-connect"
          [disabled]="adapters.testing()"
          (click)="toggle()"
        >
          <i class="ti ti-plug-connected" aria-hidden="true"></i>
          {{ (connected() ? 'telemetry.obd.disconnect' : 'telemetry.obd.connect') | translate }}
        </button>
        <button
          class="btn"
          type="button"
          data-section-test="obd-test"
          [disabled]="adapters.testing()"
          (click)="telemetry.testAdapter()"
        >
          <i class="ti ti-stethoscope" aria-hidden="true"></i>
          {{ 'telemetry.obd.test' | translate }}
        </button>
        <a class="btn" routerLink="/obd" data-section-test="obd-setup">
          <i class="ti ti-replace" aria-hidden="true"></i>{{ 'telemetry.obd.change' | translate }}
        </a>
        <button class="btn" type="button" data-section-test="obd-forget" (click)="forget()">
          <i class="ti ti-trash" aria-hidden="true"></i>{{ 'telemetry.obd.forget' | translate }}
        </button>
      </div>
      <app-adapter-test />
    } @else {
      <p class="note">{{ 'telemetry.obd.none' | translate }}</p>
      <a class="btn pri" routerLink="/obd" data-section-test="obd-setup">
        <i class="ti ti-wand" aria-hidden="true"></i>{{ 'telemetry.obd.setup' | translate }}
      </a>
    }
  `,
  styles: `
    .current {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 6px 0 10px;

      i {
        font-size: 24px;
        color: var(--a);
      }
      small {
        display: block;
        color: var(--s);
        font-size: 13px;
      }
    }
    .check {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: var(--touch);
      font-size: 15px;

      input {
        width: 24px;
        height: 24px;
        accent-color: var(--a);
      }
    }
    .btn {
      text-decoration: none;
      color: var(--t);
    }
    .btn:not(.pri) {
      background: var(--p);
    }
    .btn.pri {
      color: #fff;
    }
    .note {
      font-size: 13px;
      color: var(--s);
      margin: 6px 0 10px;
    }
  `,
})
export class ObdSettings {
  protected readonly adapters = inject(AdapterStore);
  protected readonly telemetry = inject(TelemetryStore);
  protected readonly icons = KIND_ICONS;
  protected readonly adapter = computed(() => this.adapters.settings().adapter);
  private readonly error = computed(() => this.telemetry.error() ?? this.adapters.testError());
  protected readonly connected = computed(() => {
    const mode = this.telemetry.mode();
    return mode === 'obd' || mode === 'connecting';
  });
  protected readonly errorKey = computed(() => {
    const key = obdErrorKey(this.error());
    // The steps of a test already show what failed there.
    return key === 'telemetry.obd.error.other' && !this.telemetry.error() ? '' : key;
  });
  protected readonly needsSettings = computed(() => needsSettings(this.error()));

  constructor() {
    void this.adapters.load();
  }

  protected toggle(): void {
    void (this.connected() ? this.telemetry.stop() : this.telemetry.connectObd());
  }

  protected async forget(): Promise<void> {
    if (this.connected()) await this.telemetry.stop();
    await this.adapters.forget();
  }
}
