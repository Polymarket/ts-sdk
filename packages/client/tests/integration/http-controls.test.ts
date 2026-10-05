import {
  createPublicClient,
  createSecureClient,
  RequestAbortedError,
} from '@polymarket/client';
import { fetchTag } from '@polymarket/client/actions';
import { vi } from 'vitest';
import { describe, expect, it } from './fixtures';

describe('HTTP request controls', () => {
  it('forwards live reads through custom fetch for client and extended action calls', async ({
    environment,
  }) => {
    const fetch = vi.fn(globalThis.fetch);
    const client = createPublicClient({ environment, fetch, retry: false });

    const tag = await client.fetchTag({ id: '144' });
    const extended = client.extend((base) => ({
      fetchElectionTag: () => fetchTag(base, { slug: 'elections' }),
    }));
    const sameTag = await extended.fetchElectionTag();
    const trades = await client.listTrades({ pageSize: 1 }).firstPage();

    expect(tag.id).toBe(sameTag.id);
    expect(trades.items).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('prevents dispatch when a read is already cancelled', async ({
    environment,
  }) => {
    const fetch = vi.fn(globalThis.fetch);
    const client = createPublicClient({ environment, fetch });
    const controller = new AbortController();
    const reason = { query: 'replaced' };
    controller.abort(reason);

    await expect(
      client.fetchTag({ id: '144' }, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'RequestAbortedError', cause: reason });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels an in-flight read without cancelling another read on the same client', async ({
    environment,
  }) => {
    const controller = new AbortController();
    const reason = new Error('query superseded');
    let abortedRequestSignal: AbortSignal | null | undefined;
    const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
      const response = globalThis.fetch(input, init);
      const url = input instanceof Request ? input.url : String(input);
      if (new URL(url).pathname.endsWith('/144')) {
        abortedRequestSignal =
          init?.signal ?? (input instanceof Request ? input.signal : undefined);
        controller.abort(reason);
      }
      return response;
    });
    const client = createPublicClient({ environment, fetch });

    const cancelled = client.fetchTag(
      { id: '144' },
      { signal: controller.signal },
    );
    const unaffected = client.fetchTag({ slug: 'elections' });

    await expect(cancelled).rejects.toMatchObject({
      name: 'RequestAbortedError',
      cause: reason,
    });
    await expect(unaffected).resolves.toMatchObject({ id: '144' });
    expect(abortedRequestSignal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves fetch through authentication and forwards secure account read options', async ({
    depositWalletAddress,
    depositWalletSigner,
    environment,
    secureClientWithDepositWallet,
  }) => {
    const fetch = vi.fn(globalThis.fetch);
    const client = await createSecureClient({
      credentials: secureClientWithDepositWallet.credentials,
      environment,
      fetch,
      retry: false,
      signer: depositWalletSigner,
      wallet: depositWalletAddress,
    });
    expect(fetch).toHaveBeenCalled();
    fetch.mockClear();

    await expect(client.fetchClosedOnlyMode()).resolves.toEqual(
      expect.any(Boolean),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockClear();
    const controller = new AbortController();
    controller.abort();
    await expect(
      client
        .listPositions(undefined, { signal: controller.signal })
        .firstPage(),
    ).rejects.toBeInstanceOf(RequestAbortedError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
