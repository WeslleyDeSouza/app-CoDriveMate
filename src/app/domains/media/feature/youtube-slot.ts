import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { MediaStore } from '../application/media.store';
import { YoutubeItem, YoutubePlayer } from '../domain/media';

/**
 * The YouTube player. YouTube's terms: always visible, at least 200 x 200
 * pixels, nothing in front of it - so title and close button sit above it.
 */
@Component({
  selector: 'app-youtube-slot',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <i class="ti ti-brand-youtube" aria-hidden="true"></i>
      <b data-section-test="youtube-title">{{ item().title }}</b>
      <button
        type="button"
        data-section-test="youtube-close"
        [attr.aria-label]="'media.close_player' | translate"
        (click)="store.closeYoutube()"
      >
        <i class="ti ti-x" aria-hidden="true"></i>
      </button>
    </header>
    @if (failed()) {
      <p role="alert" data-section-test="youtube-failed">{{ 'media.player_failed' | translate }}</p>
    }
    <div #player class="player" data-section-test="youtube-player"></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      border-radius: var(--r);
      overflow: hidden;
      background: var(--p);
      border: 1px solid var(--ln);
    }
    header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding-left: 14px;

      b {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 14px;
      }
      button {
        width: var(--touch);
        height: var(--touch);
        border: 0;
        background: none;
        font-size: 20px;
      }
    }
    p {
      padding: 12px 14px;
      color: var(--ba);
    }
    .player {
      flex: 1;
      min-height: 200px;
      background: #000;

      ::ng-deep iframe {
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
      }
    }
  `,
})
export class YoutubeSlot {
  readonly item = input.required<YoutubeItem>();
  protected readonly store = inject(MediaStore);
  protected readonly failed = signal(false);
  private readonly youtube = inject(YoutubePlayer);
  private readonly player = viewChild.required<ElementRef<HTMLElement>>('player');

  constructor() {
    effect((onCleanup) => {
      const item = this.item();
      let close: (() => void) | undefined;
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
        close?.();
      });
      this.failed.set(false);
      this.youtube.open(this.player().nativeElement, item).then(
        (opened) => {
          if (cancelled) opened();
          else close = opened;
        },
        () => this.failed.set(true),
      );
    });
  }
}
