import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { RoutineStore } from '../application/routine.store';

/** "As usual to the gym?" with the expected duration; one tap starts the route. */
@Component({
  selector: 'app-routine-hint',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.suggestion(); as s) {
      <div class="card" role="status" data-section-test="routine-hint">
        <button class="go" type="button" data-section-test="routine-start" (click)="store.go()">
          <i class="ti ti-route" aria-hidden="true"></i>
          <span>
            <b>{{ 'logbook.routine.title' | translate: { name: s.routine.name } }}</b>
            <small>
              @if (s.minutes !== null) {
                {{ 'logbook.routine.minutes' | translate: { minutes: s.minutes } }} ·
              }
              {{ 'logbook.routine.start' | translate }}
            </small>
          </span>
        </button>
        <button
          class="x"
          type="button"
          data-section-test="routine-dismiss"
          [attr.aria-label]="'logbook.routine.dismiss' | translate"
          (click)="store.dismiss()"
        >
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>
    }
  `,
  styles: `
    .card {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px;
      border-radius: 20px;
      background: var(--glass);
      backdrop-filter: blur(18px);
      border: 1px solid var(--ln);
      box-shadow: var(--sh);
    }
    button {
      min-height: var(--touch);
      border: 0;
      background: none;
      color: var(--t);
    }
    .go {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 14px;
      text-align: left;

      i {
        font-size: 24px;
        color: var(--a);
      }
      b {
        display: block;
        font-size: 17px;
      }
      small {
        color: var(--s);
        font-size: 14px;
      }
    }
    .x {
      min-width: var(--touch);
      font-size: 20px;
      color: var(--s);
    }
  `,
})
export class RoutineHint {
  protected readonly store = inject(RoutineStore);
}
