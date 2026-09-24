import {
  ApprovePerpsBuilderFeeError,
  FetchPerpsBuilderStatusError,
  type PerpsBuilderEarningsPage,
  type PerpsBuilderEarningsPaginator,
  UserInputError,
} from '@polymarket/client';
import { vi } from 'vitest';
import { describe, expect, it, runMeteredTests } from './fixtures';

const builderAddress = process.env.POLYMARKET_PERPS_BUILDER_ADDRESS;
const runBuilderTests =
  runMeteredTests &&
  process.env.POLYMARKET_PERPS_BUILDER_INTEGRATION === 'true';

describe('Perps builder integration', () => {
  it('rejects malformed builder discovery before making requests', async ({
    publicClient,
  }) => {
    const requests = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(
        publicClient.fetchPerpsBuilderStatus({ address: 'invalid' }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof UserInputError &&
          FetchPerpsBuilderStatusError.isError(error),
      );
      expect(requests).not.toHaveBeenCalled();
    } finally {
      requests.mockRestore();
    }
  });

  it('rejects rounded-over-cap consent and unsafe versions before signing', async ({
    secureClientWithDepositWallet: client,
  }) => {
    const signing = vi.spyOn(client.signer, 'signTypedData');
    const requests = vi.spyOn(globalThis, 'fetch');
    try {
      for (const input of [
        { maxFeeRate: '0.0010000000000000000000000001', approvalVersion: 1 },
        { maxFeeRate: '0.001', approvalVersion: Number.MAX_SAFE_INTEGER + 1 },
        { maxFeeRate: '0', approvalVersion: 0 },
      ]) {
        await expect(
          client.approvePerpsBuilderFee({
            builder: client.account.signer,
            ...input,
          }),
        ).rejects.toSatisfy(
          (error: unknown) =>
            error instanceof UserInputError &&
            ApprovePerpsBuilderFeeError.isError(error),
        );
      }
      expect(signing).not.toHaveBeenCalled();
      expect(requests).not.toHaveBeenCalled();
    } finally {
      signing.mockRestore();
      requests.mockRestore();
    }
  });

  // Creating session credentials is metered. This opt-in also requires the
  // fixture signer to be the builder account whose live reporting is tested.
  it.runIf(runBuilderTests)(
    'retains live reporting snapshots across independent iterations and continuation',
    async ({ secureClientWithDepositWallet: client, skip }) => {
      if (builderAddress === undefined) return skip();
      expect(client.account.signer.toLowerCase()).toBe(
        builderAddress.toLowerCase(),
      );
      const status = await client.fetchPerpsBuilderStatus({
        address: builderAddress,
      });
      expect(status.registered).toBe(true);

      const session = await client.openPerpsSession({ expiresIn: 30 * 60_000 });
      try {
        const first = await session.listBuilderEarnings().firstPage();
        expect(first.snapshot).not.toBeNull();
        if (first.snapshot === null)
          throw new Error('Fetched earnings need a reporting snapshot');

        const paginator = session.listBuilderEarnings(first.snapshot);
        const [left, right] = await Promise.all([
          firstTwoPages(paginator),
          firstTwoPages(paginator),
        ]);
        expect(left).toEqual(right);
        expect(left[0]).toEqual(first);
        for (const page of left) expect(page.snapshot).toEqual(first.snapshot);

        const continued = await paginator.from(first.nextCursor).firstPage();
        if (first.hasMore) {
          expect(first.nextCursor).toBeDefined();
          expect(continued).toEqual(left[1]);
        } else {
          expect(continued).toEqual({
            items: [],
            hasMore: false,
            snapshot: null,
          });
          expect(await firstTwoPages(paginator.from(undefined))).toEqual([]);
        }

        const summary = await session.fetchBuilderEarningsSummary(
          first.snapshot,
        );
        expect(summary.snapshot).toEqual(first.snapshot);
        if (!first.hasMore) {
          expect(
            summary.assets.reduce((count, asset) => count + asset.fillCount, 0),
          ).toBe(first.items.length);
        }
      } finally {
        await session.close();
      }
    },
  );
});

async function firstTwoPages(
  paginator: PerpsBuilderEarningsPaginator,
): Promise<PerpsBuilderEarningsPage[]> {
  const pages: PerpsBuilderEarningsPage[] = [];
  for await (const page of paginator) {
    pages.push(page);
    if (pages.length === 2) break;
  }
  return pages;
}
