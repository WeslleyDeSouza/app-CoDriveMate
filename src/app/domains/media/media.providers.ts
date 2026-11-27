import { Provider } from '@angular/core';
import { ASSISTANT_TOOLS } from '@core/assistant';
import { LEGACY_MIGRATIONS } from '@core/storage';
import { musicTool } from './application/media.tools';
import { MediaRemote } from './domain/media-remote';
import { BleMediaRemote } from './infrastructure/ble-media-remote';
import { MediaRepository, MusicPlayer, YoutubePlayer } from './domain/media';
import {
  AppleMusicPlayer,
  EmbeddedYoutubePlayer,
  IdbMediaRepository,
  mediaLegacyMigration,
} from './infrastructure/media-adapters';

export function provideMedia(): Provider[] {
  return [
    { provide: MusicPlayer, useClass: AppleMusicPlayer },
    { provide: MediaRemote, useClass: BleMediaRemote },
    { provide: YoutubePlayer, useClass: EmbeddedYoutubePlayer },
    { provide: MediaRepository, useClass: IdbMediaRepository },
    { provide: LEGACY_MIGRATIONS, useValue: mediaLegacyMigration, multi: true },
    { provide: ASSISTANT_TOOLS, useFactory: musicTool, multi: true },
  ];
}
