import {
  OBD_PIDS,
  PidReader,
  decodePidResponse,
  isPidSupported,
  parseAdapterVoltage,
  parseSupportedPids,
  responseLines,
} from './obd';

describe('PidReader', () => {
  it('asks for one answer', async () => {
    const sent: string[] = [];
    const reader = new PidReader(async (command) => {
      sent.push(command);
      return '41 0D 32';
    });
    expect(await reader.read(OBD_PIDS.speed)).toBe(50);
    expect(sent).toEqual(['010D1']);
  });

  it('falls back for good when the adapter does not know the suffix', async () => {
    const sent: string[] = [];
    const reader = new PidReader(async (command) => {
      sent.push(command);
      return command.length > 4 ? '?' : '41 0D 32';
    });
    expect(await reader.read(OBD_PIDS.speed)).toBe(50);
    expect(await reader.read(OBD_PIDS.speed)).toBe(50);
    expect(sent).toEqual(['010D1', '010D', '010D']);
  });

  it('keeps the suffix when the car has no such value', async () => {
    const sent: string[] = [];
    const reader = new PidReader(async (command) => {
      sent.push(command);
      return 'NO DATA';
    });
    expect(await reader.read(OBD_PIDS.fuelLevel)).toBeNull();
    expect(await reader.read(OBD_PIDS.fuelLevel)).toBeNull();
    expect(sent).toEqual(['012F1', '012F1']);
  });
});

describe('ELM327 answers', () => {
  it('normalises lines', () => {
    expect(responseLines('41 0c 1a f8\r\n\r\n>')).toEqual(['410C1AF8', '>']);
  });

  it('decodes rpm and speed', () => {
    expect(decodePidResponse(OBD_PIDS.rpm, '41 0C 1A F8\r')).toBe(1726);
    expect(decodePidResponse(OBD_PIDS.speed, '410D32')).toBe(50);
  });

  it('decodes temperatures with offset', () => {
    expect(decodePidResponse(OBD_PIDS.coolantTemp, '41 05 7B')).toBe(83);
  });

  it('skips echo and status lines before the answer', () => {
    expect(decodePidResponse(OBD_PIDS.speed, 'SEARCHING...\r41 0D 64\r')).toBe(100);
  });

  it('returns null for missing or truncated answers', () => {
    expect(decodePidResponse(OBD_PIDS.rpm, 'NO DATA')).toBeNull();
    expect(decodePidResponse(OBD_PIDS.rpm, '41 0C 1A')).toBeNull();
    expect(decodePidResponse(OBD_PIDS.rpm, 'TIMEOUT')).toBeNull();
  });

  it('reads the supported-PID mask', () => {
    const mask = parseSupportedPids('41 00 BE 3F A8 13\r');
    expect(mask).toHaveLength(32);
    expect(mask?.slice(0, 8)).toBe('10111110');
    expect(isPidSupported(OBD_PIDS.rpm, mask)).toBe(true); // PID 0C
    expect(isPidSupported({ ...OBD_PIDS.rpm, code: '02' }, mask)).toBe(false);
    expect(parseSupportedPids('UNABLE TO CONNECT')).toBeNull();
  });

  it('treats PIDs above 20 as supported so they get probed', () => {
    const none = '0'.repeat(32);
    expect(isPidSupported(OBD_PIDS.fuelLevel, none)).toBe(true);
    expect(isPidSupported(OBD_PIDS.speed, none)).toBe(false);
    expect(isPidSupported(OBD_PIDS.speed, null)).toBe(true);
  });

  it('reads the adapter voltage', () => {
    expect(parseAdapterVoltage('12.4V')).toBe(12.4);
    expect(parseAdapterVoltage('ERROR')).toBeNull();
  });
});
