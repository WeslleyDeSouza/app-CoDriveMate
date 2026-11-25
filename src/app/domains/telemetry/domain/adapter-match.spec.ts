import { FoundAdapter } from './adapter';
import { AdapterMatch, addFound, matchAdapter } from './adapter-match';

const SERIAL = ['0000fff0-0000-1000-8000-00805f9b34fb'];
const found = (id: string, match: AdapterMatch, rssi: number | null, name = id): FoundAdapter => ({
  adapter: { kind: 'ble', id, name },
  match,
  rssi,
});

describe('adapter match', () => {
  it.each([
    ['IOS-Vlink', [], 'likely'],
    ['OBDII', [], 'likely'],
    ['vgate iCar Pro', [], 'likely'],
    ['Kitchen scale', ['0000FFF0-0000-1000-8000-00805F9B34FB'], 'maybe'],
    ['Headphones', [], 'unknown'],
    [undefined, [], 'unknown'],
  ] as const)('%s is %s %s', (name, services, expected) => {
    expect(matchAdapter(name, services, SERIAL)).toBe(expected);
  });

  it('sorts by match, then by distance', () => {
    const list = [
      found('a', 'unknown', -30),
      found('b', 'likely', -80),
      found('c', 'likely', -50),
      found('d', 'maybe', null),
    ].reduce(addFound, [] as readonly FoundAdapter[]);
    expect(list.map(({ adapter }) => adapter.id)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('keeps what an earlier advertisement told', () => {
    const list = addFound([found('a', 'likely', -50, 'OBDII')], found('a', 'unknown', -40, ''));
    expect(list).toEqual([found('a', 'likely', -40, 'OBDII')]);
  });
});
