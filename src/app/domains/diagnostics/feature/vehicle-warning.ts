import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@core/i18n';
import { WarningStore } from '../application/warning.store';

/** Warning card above the map; "understood" confirms it. */
@Component({
  selector: 'app-vehicle-warning',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.shown(); as warning) {
      <section
        role="alert"
        data-section-test="warning-card"
        [class]="warning.level"
        [attr.data-warning]="warning.id"
      >
        <h3>
          <i class="ti" [class]="'ti-' + warning.icon" aria-hidden="true"></i>
          {{ 'diagnostics.warning.' + warning.id + '.title' | translate }}
        </h3>
        <b data-section-test="warning-value">{{ warning.value }}</b>
        <p>{{ 'diagnostics.warning.' + warning.id + '.text' | translate }}</p>
        <div>
          <button type="button" data-section-test="warning-confirm" (click)="store.confirm()">
            <i class="ti ti-check" aria-hidden="true"></i>{{ 'diagnostics.understood' | translate }}
          </button>
          @if (warning.route; as route) {
            <a [routerLink]="route" data-section-test="warning-open" (click)="store.confirm()">
              {{ 'diagnostics.warning.' + warning.id + '.action' | translate }}
            </a>
          }
        </div>
      </section>
    }
  `,
  styles: `
    section {
      width: min(440px, 100%);
      border-radius: 20px;
      padding: 18px 20px;
      box-shadow: var(--sh);
      background: var(--wa);
      color: #111;
    }
    .crit {
      background: var(--ba);
      color: #fff;
    }
    h3 {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 20px;
    }
    b {
      display: block;
      font-size: 34px;
      margin: 6px 0;
    }
    p {
      font-size: 16px;
      line-height: 1.4;
    }
    div {
      display: flex;
      gap: 10px;
      margin-top: 14px;
    }
    button,
    a {
      flex: 1;
      min-height: 56px;
      border: 0;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.35);
      color: inherit;
      font-size: 17px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-decoration: none;
    }
  `,
})
export class VehicleWarningCard {
  protected readonly store = inject(WarningStore);
}
