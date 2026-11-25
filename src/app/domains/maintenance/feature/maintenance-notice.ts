import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@core/i18n';
import { MaintenanceStore } from '../application/maintenance.store';

/** What is due at app start, above the map. */
@Component({
  selector: 'app-maintenance-notice',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.notice().length) {
      <div role="status" data-section-test="maintenance-notice">
        <i class="ti ti-tool" aria-hidden="true"></i>
        <p>
          {{ 'maintenance.notice' | translate }}
          @for (entry of store.notice(); track entry.id) {
            {{ $first ? '' : '· ' }}{{ entry.name || ('maintenance.item.' + entry.id | translate) }}
          }
        </p>
        <a
          routerLink="/maintenance"
          data-section-test="maintenance-notice-open"
          (click)="store.confirmNotice()"
          >{{ 'maintenance.open' | translate }}</a
        >
        <button
          type="button"
          data-section-test="maintenance-notice-confirm"
          [attr.aria-label]="'app.common.close' | translate"
          (click)="store.confirmNotice()"
        >
          <i class="ti ti-check" aria-hidden="true"></i>
        </button>
      </div>
    }
  `,
  styles: `
    div {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 56px;
      padding-left: 18px;
      border-radius: 16px;
      background: var(--wa);
      color: #111;
      font-size: 17px;
      font-weight: 600;
      box-shadow: var(--sh);
    }
    a,
    button {
      min-height: 56px;
      min-width: 56px;
      display: grid;
      place-items: center;
      border: 0;
      background: none;
      color: inherit;
      font-size: 17px;
    }
    a {
      padding: 0 8px;
    }
  `,
})
export class MaintenanceNotice {
  protected readonly store = inject(MaintenanceStore);
}
