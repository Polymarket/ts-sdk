import type { Page, Paginated, PerpsBuilderEarning } from '@polymarket/client';
import { describe, expect, it, runMeteredTests } from './fixtures';

const builderAddress = process.env.POLYMARKET_PERPS_BUILDER_ADDRESS;
const runBuilderTests =
  runMeteredTests &&
  process.env.POLYMARKET_PERPS_BUILDER_INTEGRATION === 'true';

describe('Perps builder integration', () => {
  it.runIf(runBuilderTests)(
    'resolves the default fee on setup and preserves an explicit fee on resume',
    async ({ secureClientWithDepositWallet: client, skip }) => {
      if (builderAddress === undefined) return skip();
      const status = await client.fetchPerpsBuilderStatus({
        address: builderAddress,
      });
      if (!status.registered || !status.enabled || !status.admissionEnabled)
        return skip();

      const session = await client.openPerpsSession({
        builderAttribution: { builderAddress },
        expiresIn: 30 * 60_000,
      });
      try {
        expect(session.builderAttribution?.feeRate).toBe(status.maxFeeRate);
      } finally {
        await session.close();
      }

      const resumed = await client.openPerpsSession({
        credentials: session.credentials,
        builderAttribution: { builderAddress, feeRate: '0' },
      });
      try {
        expect(resumed.builderAttribution?.feeRate).toBe('0');
      } finally {
        await resumed.close();
      }
    },
  );

  it.runIf(runBuilderTests)(
    'rejects attribution to an unregistered builder',
    async ({ secureClientWithDepositWallet: client, randomEoaSigner }) => {
      const unregisteredBuilderAddress = await randomEoaSigner.getAddress();
      await expect(
        client.openPerpsSession({
          builderAttribution: { builderAddress: unregisteredBuilderAddress },
        }),
      ).rejects.toThrow(
        'Builder attribution is not active for this builder address',
      );
    },
  );

  // Creating session credentials is metered. This opt-in also requires the
  // fixture signer to be the builder account whose live reporting is tested.
  it.runIf(runBuilderTests)(
    'pages earnings at a summary snapshot across independent iterations and continuation',
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
        const approvals = await session.fetchBuilderApprovals({
          builder: builderAddress,
        });
        for (const approval of approvals) {
          expect(approval.builder.toLowerCase()).toBe(
            builderAddress.toLowerCase(),
          );
        }

        const summary = await session.fetchBuilderEarningsSummary();
        const paginator = session.listBuilderEarnings(summary.snapshot);
        const [left, right] = await Promise.all([
          firstTwoPages(paginator),
          firstTwoPages(paginator),
        ]);
        expect(left).toEqual(right);
        const first = left[0];
        if (first === undefined) throw new Error('Expected a first page');
        for (const page of left) {
          for (const earning of page.items) {
            expect(earning.sequence).toBeLessThanOrEqual(
              summary.snapshot.asOfSequence,
            );
          }
        }

        const continued = await paginator.from(first.nextCursor).firstPage();
        if (first.hasMore) {
          expect(continued).toEqual(left[1]);
        } else {
          expect(continued).toEqual({ items: [], hasMore: false });
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
  paginator: Paginated<PerpsBuilderEarning[]>,
): Promise<Page<PerpsBuilderEarning[]>[]> {
  const pages: Page<PerpsBuilderEarning[]>[] = [];
  for await (const page of paginator) {
    pages.push(page);
    if (pages.length === 2) break;
  }
  return pages;
}
