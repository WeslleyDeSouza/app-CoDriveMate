import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@core/i18n';
import { SheetPage } from '@shared/ui/sheet-page';
import { RemoteStore } from '../application/remote.store';
import { MediaStore } from '../application/media.store';

@Component({
  selector: 'app-media-page',
  imports: [SheetPage, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet-page section="media" [title]="'media.title' | translate">
      <h3 class="sec-title">{{ 'media.apple_music' | translate }}</h3>
      @switch (store.state()) {
        @case ('on') {
          <ul>
            @for (list of store.playlists(); track list.id) {
              <li>
                <button
                  class="entry"
                  type="button"
                  [attr.data-section-test]="'media-playlist-' + list.id"
                  (click)="store.playPlaylist(list.id)"
                >
                  <i class="ti ti-playlist" aria-hidden="true"></i>
                  <span>{{ list.name }}</span>
                  <small>{{ list.count }}</small>
                </button>
              </li>
            } @empty {
              <p class="note">{{ 'media.no_playlists' | translate }}</p>
            }
          </ul>
        }
        @case ('unavailable') {
          <p class="note" data-section-test="media-music-unavailable">
            {{ 'media.only_ipad' | translate }}
          </p>
        }
        @default {
          <p class="note">{{ 'media.music_note' | translate }}</p>
          <button
            class="btn pri"
            type="button"
            data-section-test="media-connect"
            [disabled]="store.state() === 'connecting'"
            (click)="store.connect()"
          >
            <i class="ti ti-music" aria-hidden="true"></i>{{ 'media.connect' | translate }}
          </button>
          @if (store.state() === 'denied') {
            <p class="note lv-overdue" role="alert" data-section-test="media-denied">
              {{ 'media.denied' | translate }}
            </p>
          }
        }
      }

      <h3 class="sec-title">{{ 'media.all_apps' | translate }}</h3>
      <p class="note" data-section-test="media-remote-status">
        {{ 'media.remote.' + remote.status() | translate }}
      </p>
      <div class="row">
        <button
          class="btn"
          type="button"
          data-section-test="media-remote-choose"
          (click)="remote.choose()"
        >
          <i class="ti ti-bluetooth" aria-hidden="true"></i>
          {{ 'media.remote_choose' | translate }}
        </button>
        @if (remote.device()) {
          <button
            class="btn"
            type="button"
            data-section-test="media-remote-forget"
            (click)="remote.forget()"
          >
            <i class="ti ti-trash" aria-hidden="true"></i>{{ 'media.remove' | translate }}
          </button>
        }
      </div>

      <h3 class="sec-title">{{ 'media.youtube' | translate }}</h3>
      <form (submit)="$event.preventDefault(); add(link, title)">
        <label class="f">
          {{ 'media.link' | translate }}
          <input
            #link
            type="url"
            autocomplete="off"
            data-section-test="media-link"
            placeholder="https://music.youtube.com/playlist?list=…"
          />
        </label>
        <label class="f">
          {{ 'media.name' | translate }}
          <input #title type="text" autocomplete="off" data-section-test="media-name" />
        </label>
        <button class="btn" type="submit" data-section-test="media-add">
          <i class="ti ti-plus" aria-hidden="true"></i>{{ 'media.add' | translate }}
        </button>
      </form>
      @if (invalid()) {
        <p class="note lv-overdue" role="alert" data-section-test="media-invalid">
          {{ 'media.invalid' | translate }}
        </p>
      }
      <ul>
        @for (item of store.items(); track item.id) {
          <li>
            <button
              class="entry"
              type="button"
              [attr.data-section-test]="'media-play-' + item.id"
              (click)="store.playYoutube(item)"
            >
              <i
                class="ti"
                [class]="item.kind === 'playlist' ? 'ti-playlist' : 'ti-brand-youtube'"
                aria-hidden="true"
              ></i>
              <span>{{ item.title }}</span>
            </button>
            <button
              class="entry remove"
              type="button"
              [attr.data-section-test]="'media-remove-' + item.id"
              [attr.aria-label]="'media.remove' | translate"
              (click)="store.remove(item.id)"
            >
              <i class="ti ti-trash" aria-hidden="true"></i>
            </button>
          </li>
        }
      </ul>
      <p class="note">{{ 'media.youtube_note' | translate }}</p>
    </app-sheet-page>
  `,
  styles: `
    ul {
      list-style: none;
      display: grid;
      gap: 8px;
      margin: 12px 0;
    }
    li {
      display: flex;
      gap: 8px;
    }
    form {
      display: grid;
      gap: 10px;
    }
    .entry {
      flex: 1;
      min-height: var(--touch);
      min-width: 0;
      border: 0;
      border-radius: 14px;
      background: var(--p2);
      padding: 0 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 15px;
      text-align: left;

      span {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      small {
        color: var(--s);
      }
      i {
        font-size: 20px;
      }
    }
    .remove {
      flex: none;
      color: var(--s);
    }
    .note {
      font-size: 13px;
      color: var(--s);
      margin: 8px 0;
      line-height: 1.5;
    }
  `,
})
export class MediaPage {
  protected readonly store = inject(MediaStore);
  protected readonly remote = inject(RemoteStore);
  protected readonly invalid = signal(false);

  protected async add(link: HTMLInputElement, title: HTMLInputElement): Promise<void> {
    const added = await this.store.add(link.value, title.value);
    this.invalid.set(!added);
    if (added) link.value = title.value = '';
  }
}
