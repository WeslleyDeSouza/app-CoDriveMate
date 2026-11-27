import { inject } from '@angular/core';
import { AssistantTool } from '@core/assistant';
import { MediaStore } from './media.store';

const ACTIONS = ['play', 'pause', 'next'] as const;
type Action = (typeof ACTIONS)[number];

/** The copilot starts, pauses and skips the music that the app can control. */
export function musicTool(): AssistantTool {
  const media = inject(MediaStore);
  return {
    name: 'play_music',
    description:
      'Controls the music: "play" starts or resumes playback (the default), "pause" pauses ' +
      'it, "next" skips to the next track. It cannot pick a song, an artist or a playlist.',
    input: { properties: { action: { type: 'string', enum: ACTIONS } } },
    async run(input) {
      const action = (input['action'] ?? 'play') as Action;
      if (!ACTIONS.includes(action)) return `Unknown action. Known: ${ACTIONS.join(', ')}.`;

      const playing = media.nowPlaying();
      // Without the music app, only the module can control what plays.
      if (media.state() !== 'on' && !playing) {
        return media.state() === 'unavailable'
          ? 'Music cannot be controlled on this device.'
          : 'The music app is not connected yet. The driver gives access on the media page.';
      }
      if (action === 'next') {
        media.next();
        return 'Skipped to the next track.';
      }
      if (action === 'pause') {
        if (!playing?.playing) return 'No music is playing.';
        media.toggle();
        return 'Music paused.';
      }
      if (playing?.playing) return 'Music is already playing.';
      if (media.youtube()) {
        return 'The YouTube player is open; it is started on the screen. Nothing was changed.';
      }
      media.toggle();
      return 'Music playback started.';
    },
  };
}
