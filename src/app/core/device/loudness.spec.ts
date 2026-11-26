import { amplify, louder, toWav } from './loudness';

describe('loudness', () => {
  it('makes quiet sound louder and rounds off peaks instead of cutting them', () => {
    const out = amplify(Float32Array.of(0.1, -0.2, 0.6, -0.9), 2);
    expect(out[0]).toBeCloseTo(0.2, 5);
    expect(out[1]).toBeCloseTo(-0.4, 5);
    expect(out[2]).toBeGreaterThan(0.7);
    expect(out[2]).toBeLessThan(1);
    expect(out[3]).toBeLessThan(-0.7);
    expect(out[3]).toBeGreaterThan(-1);
    // Louder input stays louder after the limiter.
    expect(out[2]).toBeLessThan(Math.abs(out[3]));
  });

  it('writes a 16-bit WAV', () => {
    const wav = toWav([Float32Array.of(0, 1, -1)], 24000);
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x7fff);
  });

  it('leaves the sound as it is when not wanted louder or not decodable', async () => {
    const sound = new Blob(['x'], { type: 'audio/mpeg' });
    expect(await louder(sound, 1)).toBe(sound);
    expect(await louder(sound, 2)).toBe(sound);
  });
});
