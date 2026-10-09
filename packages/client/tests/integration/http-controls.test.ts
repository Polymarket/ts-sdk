import {
  createPublicClient,
  createSecureClient,
  FetchPerpsPositionSnapshotsError,
  FetchPerpsRegistrationError,
  RequestAbortedError,
} from '@polymarket/client';
import { fetchTag } from '@polymarket/client/actions';
import { describe, expect, it } from './fixtures';

describe('HTTP request controls', () => {
  it('forwards live reads through custom fetch for client and extended action calls', async ({
    environment,
  }) => {
    let requests = 0;
    function fetch(input: RequestInfo | URL, init?: RequestInit) {
      requests += 1;
      return globalThis.fetch(input, init);
    }
    const client = createPublicClient({ environment, fetch, retry: false });

    const tag = await client.fetchTag({ id: '144' });
    const extended = client.extend((base) => ({
      fetchElectionTag: () => fetchTag(base, { slug: 'elections' }),
    }));
    const sameTag = await extended.fetchElectionTag();
    const trades = await client.listTrades({ pageSize: 1 }).firstPage();

    expect(tag.id).toBe(sameTag.id);
    expect(trades.items).toHaveLength(1);
    expect(requests).toBe(3);
  });

  it('cancels a pending read without cancelling another read on the same client', async ({
    publicClient,
  }) => {
    const controller = new AbortController();
    const reason = new Error('query superseded');
    const cancelled = publicClient.fetchTag(
      { id: '144' },
      { signal: controller.signal },
    );
    const unaffected = publicClient.fetchTag({ slug: 'elections' });
    controller.abort(reason);

    await expect(cancelled).rejects.toMatchObject({
      name: 'RequestAbortedError',
      cause: reason,
    });
    await expect(unaffected).resolves.toMatchObject({ id: '144' });
  });

  it('cancels public Perps reads through the caller signal', async ({
    publicClient,
  }) => {
    const address = '0x0000000000000000000000000000000000000000';
    await expect(
      publicClient.fetchPerpsRegistration({ address }),
    ).resolves.toEqual(expect.any(Boolean));
    for (const read of [
      (signal: AbortSignal) =>
        publicClient.fetchPerpsRegistration({ address }, { signal }),
      (signal: AbortSignal) =>
        publicClient.fetchPerpsPositionSnapshots(
          { address, activeInstrumentIds: [0] },
          { signal },
        ),
    ]) {
      const controller = new AbortController();
      const pending = read(controller.signal);
      controller.abort('query disposed');
      await expect(pending).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof RequestAbortedError &&
          error.cause === 'query disposed' &&
          FetchPerpsRegistrationError.isError(error) &&
          FetchPerpsPositionSnapshotsError.isError(error),
      );
    }
  });

  it('preserves fetch through authentication and forwards secure account read options', async ({
    depositWalletAddress,
    depositWalletSigner,
    environment,
    secureClientWithDepositWallet,
  }) => {
    let requests = 0;
    function fetch(input: RequestInfo | URL, init?: RequestInit) {
      requests += 1;
      return globalThis.fetch(input, init);
    }
    const client = await createSecureClient({
      credentials: secureClientWithDepositWallet.credentials,
      environment,
      fetch,
      retry: false,
      signer: depositWalletSigner,
      wallet: depositWalletAddress,
    });
    expect(requests).toBeGreaterThan(0);
    requests = 0;

    await expect(client.fetchClosedOnlyMode()).resolves.toEqual(
      expect.any(Boolean),
    );
    expect(requests).toBe(1);
    const controller = new AbortController();
    const paginator = client.listPositions(
      { pageSize: 1 },
      { signal: controller.signal },
    );
    await paginator.firstPage();
    controller.abort();
    await expect(paginator.firstPage()).rejects.toBeInstanceOf(
      RequestAbortedError,
    );
  });
});
