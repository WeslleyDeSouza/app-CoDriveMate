import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { ParkingStore } from '../application/parking.store';

/** Reminder of the parking meter, above the map. */
@Component({
  selector: 'app-parking-alert',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.alert(); as alert) {
      <button
        type="button"
        role="alert"
        data-section-test="parking-alert"
        [class.over]="alert === 'over'"
        (click)="store.confirmAlert()"
      >
        <i class="ti ti-parking" aria-hidden="true"></i>
        {{ 'parking.remind.' + alert | translate: { minutes: store.minutesLeft() } }}
        <i class="ti ti-check" aria-hidden="true"></i>
      </button>
    }
  `,
  styles: `
    button {
      min-height: 56px;
      border: 0;
      border-radius: 16px;
      padding: 0 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 17px;
      font-weight: 600;
      background: var(--wa);
      color: #111;
      box-shadow: var(--sh);
    }
    .over {
      background: var(--ba);
      color: #fff;
    }
  `,
})
export class ParkingAlert {
  protected readonly store = inject(ParkingStore);
}
