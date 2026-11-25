import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { UnitsStore } from '@core/units';
import { formatDistanceIn } from '@shared/kernel/units';
import { RoadStore } from '../application/road.store';

/** The hazard ahead, above the map. */
@Component({
  selector: 'app-hazard-hint',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.hazard(); as ahead) {
      <p role="status" data-section-test="road-hazard">
        <i class="ti ti-alert-triangle" aria-hidden="true"></i>
        {{ 'road.hazard.' + ahead.hazard.kind | translate }} · {{ distance() }}
      </p>
    }
  `,
  styles: `
    p {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 52px;
      padding: 0 20px;
      border-radius: 99px;
      background: var(--glass);
      backdrop-filter: blur(18px);
      border: 1px solid var(--wa);
      font-size: 18px;
      font-weight: 600;
    }
    i {
      color: var(--wa);
      font-size: 24px;
    }
  `,
})
export class HazardHint {
  protected readonly store = inject(RoadStore);
  private readonly units = inject(UnitsStore).units;
  protected readonly distance = computed(() =>
    formatDistanceIn(this.store.hazard()?.distanceM ?? 0, this.units()),
  );
}
