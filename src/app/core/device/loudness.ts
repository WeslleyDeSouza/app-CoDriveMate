/** Above this level the soft limiter starts to round the peaks off. */
const KNEE = 0.7;

/**
 * Makes samples louder by `gain`. Peaks are rounded off softly instead of being cut,
 * so a louder voice does not crackle.
 */
export function amplify(samples: Float32Array, gain: number): Float32Array {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const level = Math.abs(samples[i] * gain);
    const limited =
      level <= KNEE ? level : KNEE + (1 - KNEE) * Math.tanh((level - KNEE) / (1 - KNEE));
    out[i] = Math.sign(samples[i]) * limited;
  }
  return out;
}

/** 16-bit PCM WAV of the channels; every player, also AVAudioPlayer, plays it. */
export function toWav(channels: readonly Float32Array[], sampleRate: number): Uint8Array {
  const frames = channels[0]?.length ?? 0;
  const count = channels.length;
  const bytes = new Uint8Array(44 + frames * count * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) =>
    [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * count * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * count * 2, true);
  let at = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[frame]));
      view.setInt16(at, Math.round(sample * 0x7fff), true);
      at += 2;
    }
  }
  return bytes;
}

/** The sound louder by `gain`; the original if it cannot be decoded here. */
export async function louder(sound: Blob, gain: number): Promise<Blob> {
  const Context = globalThis.OfflineAudioContext;
  if (gain <= 1 || !Context) return sound;
  try {
    const decoded = await new Context(1, 1, 44100).decodeAudioData(await sound.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
      amplify(decoded.getChannelData(i), gain),
    );
    const wav = toWav(channels, decoded.sampleRate);
    return new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' });
  } catch {
    return sound;
  }
}
