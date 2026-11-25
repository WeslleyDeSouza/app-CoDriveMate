import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { MemoryStore } from '../application/memory.store';

/** What the passenger remembers: to see, to delete and to switch off. */
@Component({
  selector: 'app-memory-panel',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details>
      <summary data-section-test="copilot-memory">
        {{ 'copilot.memory.title' | translate }} ({{ store.facts().length }})
      </summary>
      <p>{{ 'copilot.memory.note' | translate }}</p>
      <button
        class="btn"
        type="button"
        data-section-test="copilot-memory-toggle"
        [class.pri]="store.enabled()"
        [attr.aria-pressed]="store.enabled()"
        (click)="store.setEnabled(!store.enabled())"
      >
        {{ (store.enabled() ? 'copilot.memory.on' : 'copilot.memory.off') | translate }}
      </button>
      <ul>
        @for (fact of store.facts(); track fact.id) {
          <li>
            <span [attr.data-section-test]="'copilot-memory-fact-' + fact.id">{{ fact.text }}</span>
            <button
              class="btn"
              type="button"
              [attr.data-section-test]="'copilot-memory-forget-' + fact.id"
              [attr.aria-label]="'copilot.memory.forget' | translate"
              (click)="store.forget(fact.id)"
            >
              <i class="ti ti-trash" aria-hidden="true"></i>
            </button>
          </li>
        } @empty {
          <li data-section-test="copilot-memory-empty">{{ 'copilot.memory.empty' | translate }}</li>
        }
      </ul>
      <button
        class="btn"
        type="button"
        data-section-test="copilot-memory-clear"
        (click)="store.forgetAll()"
      >
        {{ 'copilot.memory.clear' | translate }}
      </button>
    </details>
  `,
  styles: `
    summary {
      min-height: var(--touch);
      display: flex;
      align-items: center;
      color: var(--s);
      cursor: pointer;
    }
    p {
      color: var(--s);
      font-size: 14px;
      margin-bottom: 8px;
    }
    ul {
      list-style: none;
      margin: 8px 0;
      padding: 0;
    }
    li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: var(--touch);
    }
    .btn:not(.pri) {
      background: var(--p3);
    }
  `,
})
export class MemoryPanel {
  protected readonly store = inject(MemoryStore);

  constructor() {
    void this.store.load();
  }
}
