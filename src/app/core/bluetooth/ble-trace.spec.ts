import { BleTrace } from './ble-trace';

describe('BleTrace', () => {
  it('keeps the last bytes of a device, readable', () => {
    const trace = new BleTrace();
    trace.connected('a', true);
    trace.data('a', 'in', 'c1', Uint8Array.of(1, 0x41, 0x42));
    const report = trace.report('a', null) as { frames: object[]; bytesReceived: number };
    expect(report.bytesReceived).toBe(3);
    expect(report.frames[1]).toMatchObject({ direction: 'in', hex: '01 41 42', text: '·AB' });
    for (let i = 0; i < 300; i++) trace.data('a', 'out', 'c1', Uint8Array.of(i));
    expect((trace.report('a', null) as { frames: object[] }).frames).toHaveLength(120);
    expect(trace.report('b', null)).toBeNull();
  });
});
