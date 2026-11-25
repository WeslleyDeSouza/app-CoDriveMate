import {
  AllProvidersFailedError,
  ChainProvider,
  ProviderChain,
  QuotaExhaustedError,
} from './provider-chain';

type RouteProvider = ChainProvider<[string], string>;

const provider = (id: string, run: RouteProvider['run'], available = true): RouteProvider => ({
  id,
  isAvailable: () => available,
  run,
});

describe('ProviderChain', () => {
  it('uses the first available provider', async () => {
    const chain = new ProviderChain([
      provider('google', async () => 'g', false),
      provider('mapbox', async (to) => `m:${to}`),
      provider('osm', async () => 'o'),
    ]);

    await expect(chain.run('Bern')).resolves.toEqual({
      providerId: 'mapbox',
      result: 'm:Bern',
      skipped: [],
    });
  });

  it('falls through to the next provider on failure', async () => {
    const chain = new ProviderChain([
      provider('google', async () => {
        throw new Error('offline');
      }),
      provider('osm', async () => 'o'),
    ]);

    await expect(chain.run('Bern')).resolves.toEqual({
      providerId: 'osm',
      result: 'o',
      skipped: ['google'],
    });
    expect(chain.isExhausted('google')).toBe(false);
  });

  it('pauses a provider with exhausted quota until the next day', async () => {
    let today = new Date(2026, 10, 24, 9);
    let googleCalls = 0;
    const exhausted: string[] = [];
    const chain = new ProviderChain(
      [
        provider('google', async () => {
          googleCalls++;
          throw new QuotaExhaustedError('google');
        }),
        provider('osm', async () => 'o'),
      ],
      { now: () => today, onExhausted: (id) => exhausted.push(id) },
    );

    await chain.run('Bern');
    await chain.run('Bern');
    expect(googleCalls).toBe(1);
    expect(exhausted).toEqual(['google']);
    expect(chain.exhaustedEntries()).toEqual({ google: '2026-11-24' });

    today = new Date(2026, 10, 25, 0, 1);
    expect(chain.isExhausted('google')).toBe(false);
    await chain.run('Bern');
    expect(googleCalls).toBe(2);
  });

  it('reports every failure when nothing works', async () => {
    const chain = new ProviderChain([
      provider('osm', async () => {
        throw new Error('no network');
      }),
    ]);

    const error = await chain.run('Bern').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AllProvidersFailedError);
    expect((error as AllProvidersFailedError).failures.map((f) => f.providerId)).toEqual(['osm']);
  });
});
