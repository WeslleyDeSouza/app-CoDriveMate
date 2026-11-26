import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { ConversationStore } from '../application/conversation.store';
import { CopilotStore } from '../application/copilot.store';
import { QUIZ_KEYS } from '../domain/conversation';

/** Shown above the map while a conversation runs: one tap ends it. */
@Component({
  selector: 'app-conversation-bar',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (copilot.question(); as question) {
      <div class="quiz confirm" role="alertdialog" data-section-test="copilot-confirm">
        <b>{{ question }}</b>
        <div class="choices">
          <button
            type="button"
            class="yes"
            data-section-test="copilot-confirm-yes"
            (click)="copilot.answer(true)"
          >
            <i class="ti ti-check" aria-hidden="true"></i>{{ 'copilot.confirm.yes' | translate }}
          </button>
          <button
            type="button"
            data-section-test="copilot-confirm-no"
            (click)="copilot.answer(false)"
          >
            <i class="ti ti-x" aria-hidden="true"></i>{{ 'copilot.confirm.no' | translate }}
          </button>
        </div>
      </div>
    }
    @if (store.active()) {
      <button
        class="bar"
        type="button"
        data-section-test="conversation-stop"
        [class.listening]="store.listening()"
        [class.busy]="store.current()"
        [attr.aria-label]="'copilot.talk.stop' | translate"
        (click)="store.stop()"
      >
        <i
          class="ti"
          [class]="
            store.listening()
              ? 'ti-microphone'
              : store.current()
                ? 'ti-player-stop'
                : 'ti-message-2'
          "
          aria-hidden="true"
        ></i>
        <span data-section-test="conversation-mode">
          {{ 'copilot.talk.mode.' + label() | translate }}
        </span>
        @if (score(); as points) {
          <span class="score">{{ points }}</span>
        }
      </button>
      @if (store.quiz(); as quiz) {
        <div class="quiz" data-section-test="conversation-quiz">
          <b>{{ quiz.question }}</b>
          @for (key of keys; track key) {
            <button
              type="button"
              [attr.data-section-test]="'conversation-answer-' + key"
              (click)="store.pick(key)"
            >
              {{ key.toUpperCase() }}: {{ quiz[key] }}
            </button>
          }
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: grid;
      justify-items: start;
      gap: 10px;
    }
    .bar,
    .quiz {
      background: var(--glass);
      backdrop-filter: blur(18px) saturate(1.4);
      border: 1px solid var(--ln);
      box-shadow: var(--sh);
      color: var(--t);
    }
    /* Quiet while nothing is said; one tap on it always ends the conversation. */
    .bar {
      min-width: var(--touch);
      min-height: var(--touch);
      border-radius: 99px;
      padding: 0 13px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      opacity: 0.5;
      transition: opacity 0.3s;

      i {
        font-size: 20px;
      }
      span:not(.score) {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }
    .busy,
    .bar:focus-visible {
      opacity: 1;
    }
    .listening {
      background: var(--a);
      color: #fff;
    }
    .quiz {
      border-radius: 20px;
      padding: 14px;
      display: grid;
      gap: 8px;
      width: min(420px, 100%);
    }
    .quiz b {
      font-size: 17px;
    }
    .choices {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .confirm button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-align: center;
    }
    .confirm .yes {
      background: var(--a);
      color: #fff;
    }
    .quiz button {
      min-height: 56px;
      border: 0;
      border-radius: 14px;
      background: var(--p2);
      padding: 0 16px;
      font-size: 17px;
      text-align: left;
    }
  `,
})
export class ConversationBar {
  protected readonly store = inject(ConversationStore);
  protected readonly copilot = inject(CopilotStore);
  protected readonly keys = QUIZ_KEYS;
  /** What is going on, or what is on. */
  protected readonly label = computed(
    () => this.store.current() ?? (this.store.mixed() ? 'mixed' : this.store.modes()[0]),
  );
  protected readonly score = computed(() => {
    const { right, asked } = this.store.score();
    return this.store.modes().includes('quiz') && asked ? `${right}/${asked}` : '';
  });
}
