import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { LogbookStore } from '../application/logbook.store';

/** Short hint for saving fuel, above the map. */
@Component({
  selector: 'app-eco-tip',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.tip(); as tip) {
      <p role="status" data-section-test="logbook-tip">
        <i class="ti ti-leaf" aria-hidden="true"></i>{{ 'logbook.tip.' + tip | translate }}
      </p>
    }
  `,
  styles: `
    p {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 48px;
      padding: 0 18px;
      border-radius: 99px;
      background: var(--glass);
      backdrop-filter: blur(18px);
      border: 1px solid var(--ln);
      font-size: 16px;
      font-weight: 600;
    }
    i {
      color: var(--ok);
    }
  `,
})
export class EcoTipHint {
  protected readonly store = inject(LogbookStore);
}
