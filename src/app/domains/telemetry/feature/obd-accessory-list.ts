import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { AdapterStore } from '../application/adapter.store';
import { AdapterRef } from '../domain/adapter';

/** MFi adapters that iOS has connected. */
@Component({
  selector: 'app-obd-accessory-list',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (accessory of accessories(); track accessory.id) {
      <button
        class="btn"
        type="button"
        [attr.data-section-test]="'obd-accessory-' + accessory.id"
        (click)="chosen.emit(accessory)"
      >
        <i class="ti ti-bluetooth-connected" aria-hidden="true"></i>{{ accessory.name }}
      </button>
    } @empty {
      @if (state() === 'loaded') {
        <p data-section-test="obd-accessory-none">
          {{ 'telemetry.obd.mfi.none' | translate }}
        </p>
      }
    }
    @if (state() === 'failed') {
      <p class="lv-overdue" role="alert" data-section-test="obd-accessory-error">
        {{ 'telemetry.obd.mfi.failed' | translate }}
      </p>
    }
    <button
      class="btn"
      type="button"
      data-section-test="obd-accessory-refresh"
      [disabled]="state() === 'loading'"
      (click)="refresh()"
    >
      <i class="ti ti-refresh" aria-hidden="true"></i>
      {{ 'telemetry.obd.mfi.refresh' | translate }}
    </button>
  `,
  styles: `
    :host {
      display: grid;
      justify-items: start;
      gap: 10px;
    }
    p {
      font-size: 14px;
      line-height: 1.5;
    }
  `,
})
export class ObdAccessoryList {
  private readonly store = inject(AdapterStore);
  readonly chosen = output<AdapterRef>();

  protected readonly accessories = signal<readonly AdapterRef[]>([]);
  protected readonly state = signal<'loading' | 'loaded' | 'failed'>('loading');

  constructor() {
    void this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.state.set('loading');
    try {
      this.accessories.set(await this.store.connected('mfi'));
      this.state.set('loaded');
    } catch (error) {
      console.warn('Listing the accessories failed', error);
      this.accessories.set([]);
      this.state.set('failed');
    }
  }
}
