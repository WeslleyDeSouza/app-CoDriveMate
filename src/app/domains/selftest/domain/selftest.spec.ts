import { redact, report } from './selftest';

describe('self test report', () => {
  it('contains no keys', () => {
    const text =
      'sk-ant-abc12345 pk.eyJ1Ijoi.xyz AIzaSyABCDEF https://x?access_token=secret&a=1 key=hidden';
    const safe = redact(text);
    for (const part of ['abc12345', 'eyJ1', 'SyABC', 'secret', 'hidden'])
      expect(safe).not.toContain(part);
    expect(safe).toContain('a=1');
  });

  it('lists every result', () => {
    const base = { group: 'device', manual: false } as const;
    const text = report(
      [
        { ...base, id: 'gps', state: 'ok', detail: '8 m' },
        { ...base, id: 'openai', state: 'failed', detail: 'key=abc' },
      ],
      'iPhone',
      new Date('2026-11-24T20:00:00Z'),
    );
    expect(text.split('\n')).toEqual([
      'CoDriveMate 2026-11-24T20:00',
      'iPhone',
      'OK gps: 8 m',
      'FEHLER openai: key=…',
    ]);
  });
});
