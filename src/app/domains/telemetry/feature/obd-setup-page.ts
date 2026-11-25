import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@core/i18n';
import { SheetPage } from '@shared/ui/sheet-page';
import { AdapterStore } from '../application/adapter.store';
import { TelemetryStore } from '../application/telemetry.store';
import { ADAPTER_KINDS, AdapterKind, AdapterRef } from '../domain/adapter';
import { AdapterTest } from './adapter-test';
import { KIND_ICONS } from './kind-icons';
import { ObdAccessoryList } from './obd-accessory-list';
import { needsSettings, obdErrorKey } from './obd-error';
import { ObdDeviceList } from './obd-device-list';
import { ObdWifiForm } from './obd-wifi-form';

const STEPS = ['kind', 'prepare', 'choose', 'test', 'done'] as const;
const HINTS: Record<AdapterKind, readonly string[]> = {
  ble: ['plug', 'ignition', 'bluetooth', 'permission', 'pairing'],
  wifi: ['plug', 'ignition', 'wifi_join', 'wifi_permission', 'wifi_internet'],
  mfi: ['plug', 'ignition', 'mfi_pair', 'mfi_apps'],
};

/** Guides through setting up the OBD adapter. */
@Component({
  selector: 'app-obd-setup-page',
  imports: [AdapterTest, ObdAccessoryList, ObdDeviceList, ObdWifiForm, SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet-page section="obd-setup" [title]="'telemetry.obd.setup_title' | translate">
      <div class="progress" aria-hidden="true">
        @for (name of steps; track name; let i = $index) {
          <i [class.on]="i <= index()"></i>
        }
      </div>
      <h3 data-section-test="obd-setup-step">
        {{ 'telemetry.obd.wizard.' + step() + '_title' | translate }}
      </h3>
      <p class="note">{{ textKey() | translate }}</p>

      @switch (step()) {
        @case ('kind') {
          <div class="kinds">
            @for (kind of kinds; track kind) {
              <button
                type="button"
                [class.on]="kind === selected()"
                [disabled]="!adapters.supports(kind)"
                [attr.aria-pressed]="kind === selected()"
                [attr.data-section-test]="'obd-kind-' + kind"
                (click)="selected.set(kind)"
              >
                <i class="ti" [class]="'ti-' + icons[kind]" aria-hidden="true"></i>
                <span>
                  <b>{{ 'telemetry.obd.kind.' + kind | translate }}</b>
                  <small>
                    {{
                      (adapters.supports(kind)
                        ? 'telemetry.obd.kind_note.' + kind
                        : 'telemetry.obd.kind_unavailable.' + kind
                      ) | translate
                    }}
                  </small>
                </span>
              </button>
            }
          </div>
        }
        @case ('prepare') {
          <ol>
            @for (hint of hints(); track hint) {
              <li>{{ 'telemetry.obd.prepare.' + hint | translate }}</li>
            }
          </ol>
        }
        @case ('choose') {
          @if (chosen(); as a) {
            <p class="chosen" data-section-test="obd-setup-chosen">
              <i class="ti ti-circle-check" aria-hidden="true"></i>{{ a.name }}
            </p>
          }
          @switch (selected()) {
            @case ('wifi') {
              <app-obd-wifi-form (chosen)="use($event)" (changed)="edited.set(true)" />
            }
            @case ('mfi') {
              <app-obd-accessory-list (chosen)="use($event)" />
            }
            @default {
              @if (adapters.canScan('ble')) {
                <app-obd-device-list (chosen)="use($event)" (failed)="error.set($event)" />
              } @else {
                <button
                  class="btn"
                  type="button"
                  data-section-test="obd-choose"
                  [disabled]="choosing()"
                  (click)="choose()"
                >
                  <i class="ti ti-search" aria-hidden="true"></i>
                  {{ 'telemetry.obd.search' | translate }}
                </button>
              }
            }
          }
          @if (errorKey(); as key) {
            <p class="note lv-overdue" role="alert" data-section-test="obd-setup-error">
              {{ key | translate }}
            </p>
            @if (needsSettings()) {
              <button
                class="btn"
                type="button"
                data-section-test="obd-setup-open-settings"
                (click)="adapters.openSettings()"
              >
                <i class="ti ti-settings" aria-hidden="true"></i>
                {{ 'telemetry.obd.open_settings' | translate }}
              </button>
            }
          }
        }
        @case ('test') {
          <button
            class="btn"
            type="button"
            data-section-test="obd-setup-test"
            [disabled]="adapters.testing()"
            (click)="test()"
          >
            <i class="ti ti-stethoscope" aria-hidden="true"></i>
            {{ 'telemetry.obd.test' | translate }}
          </button>
          <app-adapter-test />
          @if (passed() === true) {
            <p class="note lv-ok" data-section-test="obd-setup-passed">
              {{ 'telemetry.obd.passed' | translate }}
            </p>
          }
        }
        @case ('done') {
          <label class="check">
            <input
              type="checkbox"
              data-section-test="obd-setup-auto"
              [checked]="adapters.settings().autoConnect"
              (change)="adapters.setAutoConnect($any($event.target).checked)"
            />
            {{ 'telemetry.obd.auto' | translate }}
          </label>
        }
      }

      <div class="nav">
        @if (index() > 0) {
          <button
            class="btn"
            type="button"
            data-section-test="obd-setup-back"
            [disabled]="adapters.testing()"
            (click)="go(-1)"
          >
            {{ 'telemetry.obd.back' | translate }}
          </button>
        }
        @if (step() !== 'done') {
          <button
            class="btn pri"
            type="button"
            data-section-test="obd-setup-next"
            [disabled]="!canContinue()"
            (click)="go(1)"
          >
            {{
              (step() === 'test' && passed() !== true ? 'telemetry.obd.skip' : 'telemetry.obd.next')
                | translate
            }}
          </button>
        } @else {
          <button
            class="btn pri"
            type="button"
            data-section-test="obd-setup-finish"
            (click)="finish()"
          >
            <i class="ti ti-plug-connected" aria-hidden="true"></i>
            {{ 'telemetry.obd.finish' | translate }}
          </button>
        }
      </div>
    </app-sheet-page>
  `,
  styles: `
    .progress {
      display: flex;
      gap: 6px;
      margin-bottom: 18px;

      i {
        flex: 1;
        height: 4px;
        border-radius: 2px;
        background: var(--p3);
      }
      .on {
        background: var(--a);
      }
    }
    h3 {
      font-size: 19px;
      margin-bottom: 6px;
    }
    .note {
      font-size: 14px;
      color: var(--s);
      line-height: 1.5;
      margin-bottom: 14px;
    }
    .kinds {
      display: grid;
      gap: 10px;

      button {
        display: flex;
        align-items: center;
        gap: 14px;
        min-height: 68px;
        padding: 10px 16px;
        border: 2px solid transparent;
        border-radius: 16px;
        background: var(--p2);
        text-align: left;
      }
      .on {
        border-color: var(--a);
      }
      button:disabled {
        opacity: 0.5;
        cursor: default;
      }
      i {
        font-size: 26px;
        color: var(--a);
      }
      b {
        font-size: 16px;
        font-weight: 600;
      }
      small {
        display: block;
        color: var(--s);
        font-size: 13px;
      }
    }
    ol {
      padding-left: 22px;
      display: grid;
      gap: 12px;
      font-size: 15px;
      line-height: 1.5;
    }
    .chosen {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 14px;

      i {
        font-size: 22px;
        color: var(--ok);
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
    .nav {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-top: 26px;

      .pri {
        margin-left: auto;
      }
      button:disabled {
        opacity: 0.5;
        cursor: default;
      }
    }
  `,
})
export class ObdSetupPage {
  protected readonly adapters = inject(AdapterStore);
  private readonly telemetry = inject(TelemetryStore);
  private readonly router = inject(Router);

  protected readonly steps = STEPS;
  protected readonly kinds = ADAPTER_KINDS;
  protected readonly icons = KIND_ICONS;
  protected readonly index = signal(0);
  protected readonly step = computed(() => STEPS[this.index()]);
  protected readonly selected = signal<AdapterKind>('ble');
  protected readonly choosing = signal(false);
  protected readonly passed = signal<boolean | null>(null);
  protected readonly error = signal<unknown>(null);
  protected readonly errorKey = computed(() => obdErrorKey(this.error()));
  protected readonly needsSettings = computed(() => needsSettings(this.error()));
  /** The typed WiFi address has not been taken yet. */
  protected readonly edited = signal(false);
  protected readonly hints = computed(() => HINTS[this.selected()]);
  protected readonly textKey = computed(() => {
    const own = this.step() === 'choose' && this.selected() !== 'ble';
    return `telemetry.obd.wizard.${this.step()}_text${own ? '_' + this.selected() : ''}`;
  });
  /** The remembered adapter, if it is of the selected kind. */
  protected readonly chosen = computed(() => {
    const { adapter } = this.adapters.settings();
    return adapter?.kind === this.selected() && !this.edited() ? adapter : null;
  });
  protected readonly canContinue = computed(() => {
    if (this.step() === 'choose') return this.chosen() !== null && !this.choosing();
    return !this.adapters.testing();
  });

  constructor() {
    void this.adapters.load();
  }

  protected go(by: number): void {
    this.edited.set(false);
    this.error.set(null);
    this.index.update((i) => Math.max(0, Math.min(STEPS.length - 1, i + by)));
  }

  protected choose(): Promise<void> {
    return this.pick(() => this.adapters.choose(this.selected()));
  }

  protected use(adapter: AdapterRef): Promise<void> {
    return this.pick(() => this.adapters.select(adapter));
  }

  private async pick(action: () => Promise<unknown>): Promise<void> {
    this.error.set(null);
    this.choosing.set(true);
    try {
      // The old adapter must be free before another one is picked. Not awaited
      // when idle: browsers only open the picker right after a tap.
      if (this.telemetry.mode() !== 'off') void this.telemetry.stop();
      await action();
      this.edited.set(false);
      this.passed.set(null);
    } catch (error) {
      this.error.set(error);
    } finally {
      this.choosing.set(false);
    }
  }

  protected async test(): Promise<void> {
    this.passed.set(null);
    this.passed.set(await this.telemetry.testAdapter());
  }

  protected finish(): void {
    if (this.telemetry.mode() === 'off') void this.telemetry.connectObd();
    void this.router.navigateByUrl('/');
  }
}
