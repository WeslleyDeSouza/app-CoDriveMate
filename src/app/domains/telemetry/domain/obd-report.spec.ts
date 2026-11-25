import { collectObd, isReportRequest, pidsOfMask } from './obd-report';

describe('report of the car', () => {
  it('only reads', () => {
    for (const command of ['010C', '03', '07', '0A', 'ATRV']) {
      expect(isReportRequest(command)).toBe(true);
    }
    // clearing, actuators, chassis number, settings of the adapter, manufacturer
    for (const command of ['04', '0801', '0902', 'ATZ', 'ATSP0', '2E0101', '010C1']) {
      expect(isReportRequest(command)).toBe(false);
    }
  });

  it('reads the masks of all control units', () => {
    expect(pidsOfMask('00', '41 00 80 00 00 01')).toEqual(['01', '20']);
    expect(pidsOfMask('20', '41 20 80 00 00 00\r41 20 00 00 00 01')).toEqual(['21', '40']);
    expect(pidsOfMask('00', 'NO DATA')).toEqual([]);
  });

  it('asks only for what is delivered, and decodes it', async () => {
    const asked: string[] = [];
    const table: Record<string, string> = { '0100': '41 00 08 10 00 00', '010C': '41 0C 1F 40' };
    const request = async (command: string) => {
      asked.push(command);
      expect(isReportRequest(command)).toBe(true);
      return table[command] ?? 'NO DATA';
    };
    const report = await collectObd(
      request,
      () => undefined,
      () => false,
    );
    expect(report.complete).toBe(true);
    expect(report.supportedPids).toEqual(['05', '0C']);
    expect(report.answers['010C']).toMatchObject({ name: 'rpm', value: 2000, raw: '41 0C 1F 40' });
    expect(asked).not.toContain('0120');
    expect(asked).not.toContain('010D');
  });

  it('can be stopped and keeps what it has', async () => {
    let count = 0;
    const request = async () => String(++count);
    const report = await collectObd(
      request,
      () => undefined,
      () => count >= 3,
    );
    expect(report.complete).toBe(false);
    expect(Object.keys(report.answers)).toHaveLength(3);
  });
});
