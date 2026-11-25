/** iOS only. Other apps' music is turned down meanwhile, not stopped. */
export interface VoiceNativePlugin {
  /** Plays a sound file (base64); resolves at its end or when stopped. */
  play(options: { data: string }): Promise<void>;
  /** Speaks with a voice of the device; resolves at the end or when stopped. */
  speak(options: { text: string; locale: string; rate: number; voice?: string }): Promise<void>;
  stop(): Promise<void>;
  /** What was said, '' if nothing. Permissions must have been granted. */
  listen(options: { language: string; maxMs: number }): Promise<{ text: string }>;
  stopListening(): Promise<void>;
}

export declare const VoiceNative: VoiceNativePlugin;
