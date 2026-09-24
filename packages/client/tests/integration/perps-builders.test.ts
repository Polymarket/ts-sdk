import type { Page, Paginated, PerpsBuilderEarning } from '@polymarket/client';
import { describe, expect, it, runMeteredTests } from './fixtures';

const builderAddress = process.env.POLYMARKET_PERPS_BUILDER_ADDRESS;
const runBuilderTests =
  runMeteredTests &&
  process.env.POLYMARKET_PERPS_BUILDER_INTEGRATION === 'true';

describe('Perps builder integration', () => {
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
