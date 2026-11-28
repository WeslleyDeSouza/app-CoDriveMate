import { TestBed } from '@angular/core/testing';
import { telemetryTesting } from '@domains/telemetry/testing';
import { lightingTesting } from '../testing';
import { LightStore } from './light.store';

describe('LightStore, opened again', () => {
  function setup(known: boolean) {
    const fakes = lightingTesting();
    if (known) fakes.repository.device = { id: 'l1', name: 'Licht' };
    TestBed.configureTestingModule({
      providers: [...telemetryTesting().providers, ...fakes.providers],
    });
    return { fakes, store: TestBed.inject(LightStore) };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  it('tries a known module at once when it is not connected', async () => {
    const { fakes, store } = setup(true);
    fakes.module.failure = new Error('out of range');
    await store.start();
    await settle();
    expect(store.status()).toBe('off');
    fakes.module.failure = undefined;
    await store.wake();
    expect(store.status()).toBe('connected');
    await store.disconnect();
  });

  it('leaves a connected module alone and does nothing without a known one', async () => {
    const { fakes, store } = setup(true);
    await store.start();
    await settle();
    const sent = fakes.module.sent.length;
    await store.wake();
    expect(fakes.module.sent.length).toBe(sent);
    await store.disconnect();

    TestBed.resetTestingModule();
    const empty = setup(false);
    await empty.store.wake();
    await empty.store.wake();
    expect(empty.store.status()).toBe('off');
  });
});
