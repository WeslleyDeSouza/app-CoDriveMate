import { bestVoice } from './device-voice';

const voice = (lang: string, voiceURI: string) => ({ lang, voiceURI });
const ELOQUENCE = voice('de-DE', 'com.apple.eloquence.de-DE.Eddy');
const COMPACT = voice('de-DE', 'com.apple.voice.compact.de-DE.Anna');
const ENHANCED = voice('de-DE', 'com.apple.voice.enhanced.de-DE.Anna');
const PREMIUM = voice('de-DE', 'com.apple.voice.premium.de-DE.Anna');
const ENGLISH = voice('en-GB', 'com.apple.voice.premium.en-GB.Serena');
const AMERICAN = voice('en-US', 'com.apple.voice.premium.en-US.Ava');

describe('bestVoice', () => {
  it('prefers premium, then enhanced, then compact voices', () => {
    expect(bestVoice([ELOQUENCE, COMPACT, ENHANCED, PREMIUM], 'de-DE')).toBe(3);
    expect(bestVoice([ELOQUENCE, COMPACT, ENHANCED], 'de-DE')).toBe(2);
    expect(bestVoice([ELOQUENCE, COMPACT], 'de-DE')).toBe(1);
  });

  it('never takes a voice of another language', () => {
    expect(bestVoice([ENGLISH, COMPACT], 'de-DE')).toBe(1);
    expect(bestVoice([ENGLISH], 'de-DE')).toBe(-1);
  });

  it('prefers the region only between voices of the same quality', () => {
    expect(bestVoice([AMERICAN, ENGLISH], 'en-GB')).toBe(1);
    expect(
      bestVoice([AMERICAN, voice('en-GB', 'com.apple.voice.compact.en-GB.Daniel')], 'en-GB'),
    ).toBe(0);
  });

  it('leaves the mechanical voices to the default', () => {
    expect(bestVoice([ELOQUENCE], 'de-DE')).toBe(-1);
    expect(bestVoice([voice('en-US', 'com.apple.speech.synthesis.voice.Fred')], 'en-GB')).toBe(-1);
  });
});
