import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SpeechInput } from '@core/device';
import { TranslatePipe, TranslateService } from '@core/i18n';
import { SheetPage } from '@shared/ui/sheet-page';
import { ConversationStore } from '../application/conversation.store';
import { ChatLine, CopilotStore } from '../application/copilot.store';
import { TalkStyle } from '../domain/passenger';

const QUESTIONS = ['engine', 'battery', 'saving', 'values'];
const LISTEN_MS = 10_000;

/** Questions to the copilot and the conversation modes. */
@Component({
  selector: 'app-copilot-page',
  imports: [RouterLink, SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet-page section="copilot" [title]="'copilot.title' | translate">
      <div class="page">
        <div class="talk">
          <span
            ><i class="ti ti-messages" aria-hidden="true"></i
            >{{ 'copilot.talk.title' | translate }}</span
          >
          @if (talk.allowed()) {
            <div class="row">
              @for (style of styles; track style) {
                <button
                  class="btn"
                  type="button"
                  [attr.data-section-test]="'copilot-style-' + style"
                  [class.pri]="talk.style() === style"
                  [attr.aria-pressed]="talk.style() === style"
                  (click)="talk.setStyle(style)"
                >
                  {{ 'copilot.talk.style.' + style | translate }}
                </button>
              }
            </div>
            <div class="row">
              @for (mode of talk.offered(); track mode) {
                <button
                  class="btn"
                  type="button"
                  [attr.data-section-test]="'copilot-talk-' + mode"
                  [class.pri]="talk.modes().includes(mode)"
                  [attr.aria-pressed]="talk.modes().includes(mode)"
                  (click)="talk.toggle(mode)"
                >
                  {{ 'copilot.talk.mode.' + mode | translate }}
                </button>
              }
              <button
                class="btn"
                type="button"
                data-section-test="copilot-talk-all"
                [class.pri]="talk.modes().length === talk.offered().length"
                [attr.aria-pressed]="talk.modes().length === talk.offered().length"
                (click)="talk.toggleAll()"
              >
                <i class="ti ti-arrows-shuffle" aria-hidden="true"></i>
                {{ 'copilot.talk.mode.mixed' | translate }}
              </button>
            </div>
          } @else {
            <p class="note" data-section-test="copilot-talk-off">
              {{ 'copilot.talk.off' | translate }}
            </p>
          }
          @if (talk.notice(); as notice) {
            <p class="note" role="status" data-section-test="copilot-talk-notice">
              {{ 'copilot.talk.notice.' + notice | translate }}
            </p>
          }
        </div>

        <div class="chat" #chat aria-live="polite" data-section-test="copilot-chat">
          @for (line of store.lines(); track line.id) {
            <p class="msg" [class.user]="line.from === 'user'">
              @for (part of parts(line); track $index) {
                @if (part.bold) {
                  <b>{{ part.text }}</b>
                } @else {
                  {{ part.text }}
                }
              }
            </p>
          } @empty {
            <div class="row start">
              @for (question of questions; track question) {
                <button
                  class="btn"
                  type="button"
                  [attr.data-section-test]="'copilot-question-' + question"
                  (click)="askPrepared(question)"
                >
                  {{ 'copilot.question.' + question | translate }}
                </button>
              }
            </div>
          }
          @if (store.busy()) {
            <p class="msg" data-section-test="copilot-busy">{{ 'copilot.thinking' | translate }}</p>
          }
        </div>

        @if (store.failure(); as failure) {
          <p class="note bad" role="alert" data-section-test="copilot-failure">
            {{ 'copilot.failure.' + failure | translate }}
            @if (failure === 'key') {
              <a class="btn" routerLink="/settings" data-section-test="copilot-open-settings">
                {{ 'copilot.open_settings' | translate }}
              </a>
            }
          </p>
        }
        @if (micFailed()) {
          <p class="note" role="status" data-section-test="copilot-no-microphone">
            {{ 'copilot.talk.notice.no_microphone' | translate }}
          </p>
        }

        <form class="in" (submit)="$event.preventDefault(); send(input)">
          <input
            #input
            type="text"
            autocomplete="off"
            enterkeyhint="send"
            data-section-test="copilot-input"
            [placeholder]="'copilot.placeholder' | translate"
            [attr.aria-label]="'copilot.placeholder' | translate"
          />
          <button
            class="btn"
            type="button"
            data-section-test="copilot-microphone"
            [class.pri]="listening()"
            [attr.aria-pressed]="listening()"
            [attr.aria-label]="'copilot.microphone' | translate"
            (click)="toggleMicrophone()"
          >
            <i class="ti ti-microphone" aria-hidden="true"></i>
          </button>
          <button
            class="btn pri"
            type="submit"
            data-section-test="copilot-send"
            [disabled]="store.busy()"
            [attr.aria-label]="'copilot.send' | translate"
          >
            <i class="ti ti-send" aria-hidden="true"></i>
          </button>
          @if (store.lines().length) {
            <button
              class="btn"
              type="button"
              data-section-test="copilot-clear"
              [attr.aria-label]="'copilot.clear' | translate"
              (click)="store.clear()"
            >
              <i class="ti ti-trash" aria-hidden="true"></i>
            </button>
          }
        </form>
      </div>
    </app-sheet-page>
  `,
  styles: `
    .page {
      display: flex;
      flex-direction: column;
      gap: 12px;
      height: 100%;
      min-height: 320px;
    }
    .talk {
      display: grid;
      gap: 8px;

      span {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--s);
        font-size: 14px;
      }
    }
    .btn:not(.pri) {
      background: var(--p3);
    }
    .chat {
      flex: 1;
      min-height: 120px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .msg {
      align-self: flex-start;
      max-width: 88%;
      background: var(--p2);
      border-radius: 16px;
      padding: 12px 14px;
      font-size: 16px;
      line-height: 1.4;
      white-space: pre-line;
    }
    .user {
      align-self: flex-end;
      background: var(--a);
      color: #fff;
    }
    .note {
      color: var(--s);
      font-size: 14px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }
    .note .btn {
      color: inherit;
      text-decoration: none;
    }
    .bad {
      color: var(--ba);
    }
    .in {
      display: flex;
      gap: 8px;
      /* stays in reach on a low phone screen */
      position: sticky;
      bottom: 0;
      background: var(--p);

      input {
        flex: 1;
        min-width: 0;
        min-height: var(--touch);
        border: 1px solid var(--ln);
        border-radius: 12px;
        background: var(--p2);
        padding: 0 14px;
        font-size: 16px;
      }
    }
  `,
})
export class CopilotPage {
  protected readonly store = inject(CopilotStore);
  protected readonly talk = inject(ConversationStore);
  private readonly microphone = inject(SpeechInput);
  private readonly translate = inject(TranslateService);
  private readonly chat = viewChild.required<ElementRef<HTMLElement>>('chat');

  protected readonly styles: readonly TalkStyle[] = ['dialogue', 'monologue'];
  protected readonly questions = QUESTIONS;
  protected readonly listening = signal(false);
  protected readonly micFailed = signal(false);

  constructor() {
    effect(() => {
      this.store.lines();
      this.store.busy();
      const chat = this.chat().nativeElement;
      setTimeout(() => (chat.scrollTop = chat.scrollHeight));
    });
    const router = inject(Router);
    if (inject(ActivatedRoute).snapshot.queryParamMap.get('ask') === 'codes') {
      this.askPrepared('codes');
      // Going back must not ask again.
      void router.navigate([], { queryParams: {}, replaceUrl: true });
    }
    inject(DestroyRef).onDestroy(() => {
      if (this.listening()) this.microphone.abort();
    });
  }

  protected ask(question: string): void {
    void this.store.ask(question);
  }

  protected askPrepared(question: string): void {
    this.ask(this.translate.translate('copilot.question.' + question) ?? '');
  }

  protected send(input: HTMLInputElement): void {
    if (this.store.busy()) return;
    this.ask(input.value);
    input.value = '';
  }

  protected async toggleMicrophone(): Promise<void> {
    if (this.listening()) return this.microphone.abort();
    // Both would want the microphone.
    this.talk.stop();
    this.micFailed.set(false);
    this.listening.set(true);
    try {
      const lang = this.translate.lang === 'de' ? 'de-CH' : 'en-GB';
      this.ask(await this.microphone.listen(lang, LISTEN_MS));
    } catch {
      this.micFailed.set(true);
    } finally {
      this.listening.set(false);
    }
  }

  /** The model emphasises with **stars**; everything else stays plain text. */
  protected parts({ text }: ChatLine): { text: string; bold: boolean }[] {
    return text.split('**').map((part, i) => ({ text: part, bold: i % 2 === 1 }));
  }
}
