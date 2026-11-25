import { Capacitor } from '@capacitor/core';
import { VoiceNative } from '@codrivemate/voice-native';

/** iOS: sound and microphone that only turn the music of other apps down; null elsewhere. */
export const nativeVoice = () => (Capacitor.getPlatform() === 'ios' ? VoiceNative : null);
