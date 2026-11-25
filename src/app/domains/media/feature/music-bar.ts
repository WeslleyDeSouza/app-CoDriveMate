import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { MediaStore } from '../application/media.store';

/** What is playing, with large controls. Empty while there is nothing. */
@Component({
  selector: 'app-music-bar',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.nowPlaying(); as song) {
      <div class="bar" data-section-test="music-bar">
        @if (song.artwork) {
          <img [src]="song.artwork" alt="" />
        } @else {
          <i class="ti ti-music cover" aria-hidden="true"></i>
        }
        <div class="text">
          <b data-section-test="music-title">{{ song.title }}</b>
          <small>{{ song.artist }}</small>
        </div>
        <button
          type="button"
          data-section-test="music-previous"
          [attr.aria-label]="'media.previous' | translate"
          (click)="store.previous()"
        >
          <i class="ti ti-player-skip-back" aria-hidden="true"></i>
        </button>
        <button
          type="button"
          data-section-test="music-toggle"
          [attr.aria-label]="(song.playing ? 'media.pause' : 'media.play') | translate"
          (click)="store.toggle()"
        >
          <i
            class="ti"
            [class]="song.playing ? 'ti-player-pause' : 'ti-player-play'"
            aria-hidden="true"
          ></i>
        </button>
        <button
          type="button"
          data-section-test="music-next"
          [attr.aria-label]="'media.next' | translate"
          (click)="store.next()"
        >
          <i class="ti ti-player-skip-forward" aria-hidden="true"></i>
        </button>
      </div>
    }
  `,
  styles: `
    .bar {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--p);
      border: 1px solid var(--ln);
      border-radius: 14px;
      padding: 8px 10px;
    }
    img,
    .cover {
      width: 48px;
      height: 48px;
      border-radius: 10px;
      object-fit: cover;
      background: var(--p2);
      display: grid;
      place-items: center;
      font-size: 22px;
      color: var(--s);
    }
    .text {
      flex: 1;
      min-width: 0;
      padding: 0 6px;
    }
    b,
    small {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    b {
      font-size: 15px;
    }
    small {
      font-size: 13px;
      color: var(--s);
    }
    button {
      width: 52px;
      height: 52px;
      border: 0;
      border-radius: 14px;
      background: var(--p2);
      font-size: 22px;
    }
  `,
})
export class MusicBar {
  protected readonly store = inject(MediaStore);
}
