import { VOICE_LOCALES } from './device-voice';

export type CloudVoiceProvider = 'google' | 'openai' | 'elevenlabs';

export const CLOUD_VOICES = ['Aoede', 'Kore', 'Leda', 'Charon', 'Puck', 'Fenrir'] as const;
export const OPENAI_VOICES = ['marin', 'cedar', 'coral', 'nova', 'sage', 'ash', 'onyx'] as const;

export interface VoiceRequest {
  readonly key: string;
  readonly voice: string;
  readonly text: string;
  readonly lang: string;
  readonly rate: number;
}

export interface VoiceService {
  /** Only where a sentence may be kept on the device. */
  readonly cacheable: boolean;
  /** The answer is the sound itself, not JSON. */
  readonly binary: boolean;
  request(request: VoiceRequest): { url: string; init: RequestInit };
}

const post = (headers: Record<string, string>, body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The voice name of Google depends on the language. */
export function googleVoice(voice: string, lang: string): { languageCode: string; name: string } {
  const languageCode = VOICE_LOCALES[lang] ?? 'de-DE';
  return { languageCode, name: `${languageCode}-Chirp3-HD-${voice}` };
}

export const VOICE_SERVICES: Record<CloudVoiceProvider, VoiceService> = {
  google: {
    cacheable: true,
    binary: false,
    request: ({ key, voice, text, lang, rate }) => ({
      url: 'https://texttospeech.googleapis.com/v1/text:synthesize',
      init: post(
        { 'x-goog-api-key': key },
        {
          input: { text },
          voice: googleVoice(voice, lang),
          audioConfig: { audioEncoding: 'MP3', speakingRate: rate },
        },
      ),
    }),
  },
  // OpenAI shuts this model down on 2027-01-06; the device speaks from then on.
  openai: {
    cacheable: false,
    binary: true,
    request: ({ key, voice, text, rate }) => ({
      url: 'https://api.openai.com/v1/audio/speech',
      init: post(
        { authorization: 'Bearer ' + key },
        {
          model: 'gpt-4o-mini-tts',
          voice,
          input: text,
          speed: clamp(rate, 0.25, 4),
          response_format: 'mp3',
        },
      ),
    }),
  },
  elevenlabs: {
    cacheable: false,
    binary: true,
    request: ({ key, voice, text, lang, rate }) => ({
      url:
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}` +
        '?output_format=mp3_44100_64',
      init: post(
        { 'xi-api-key': key },
        {
          text,
          model_id: 'eleven_v4_turbo',
          language_code: lang,
          voice_settings: { speed: clamp(rate, 0.7, 1.2) },
        },
      ),
    }),
  },
};

/** Why a service does not speak, null if only this request failed. */
export function voiceProblem(status: number, body: string): 'refused' | 'quota' | null {
  if (status === 402 || status === 429 || /quota_exceeded|insufficient_quota/.test(body)) {
    return 'quota';
  }
  return [400, 401, 403, 404, 422].includes(status) ? 'refused' : null;
}
