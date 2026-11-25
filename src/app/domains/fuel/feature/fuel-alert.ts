import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@core/i18n';
import { UnitsStore } from '@core/units';
import { formatDistanceIn } from '@shared/kernel/units';
import { FuelStore } from '../application/fuel.store';

/** Warning about a short range, above the map. */
@Component({
  selector: 'app-fuel-alert',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.alert()) {
      <div role="alert" data-section-test="fuel-alert">
        <i class="ti ti-gas-station" aria-hidden="true"></i>
        <span>{{ 'fuel.low' | translate: { range: range() } }}</span>
        <a routerLink="/fuel" data-section-test="fuel-alert-open" (click)="store.confirmAlert()">{{
          'fuel.stations' | translate
        }}</a>
        <button
          type="button"
          data-section-test="fuel-alert-confirm"
          [attr.aria-label]="'app.common.close' | translate"
          (click)="store.confirmAlert()"
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
export class FuelAlert {
  protected readonly store = inject(FuelStore);
  private readonly units = inject(UnitsStore).units;
  protected readonly range = computed(() =>
    formatDistanceIn((this.store.rangeKm() ?? 0) * 1000, this.units()),
  );
}
