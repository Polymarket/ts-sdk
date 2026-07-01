import { describe, expect, it } from './fixtures';
import { expectNonEmptyPage, expectPageWindow } from './helpers';

describe('MarketClarifications', () => {
  describe('listMarketClarifications', () => {
    it('fetches market clarifications', async ({ publicClient }) => {
      const paginator = publicClient.listMarketClarifications({
        pageSize: 50,
      });
      const result = await paginator.firstPage().then(expectNonEmptyPage);

      expect(result.items.length).toBeGreaterThan(0);
      await expectPageWindow(paginator, result, 49);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
        }),
      );
    });

    it('filters by market id', async ({ publicClient }) => {
      const {
        items: [clarification],
      } = await publicClient
        .listMarketClarifications({ pageSize: 1 })
        .firstPage()
        .then(expectNonEmptyPage);

      const marketId = clarification.marketId;
      expect(marketId).toBeDefined();

      const filtered = await publicClient
        .listMarketClarifications({ marketId: marketId as string })
        .firstPage()
        .then(expectNonEmptyPage);

      for (const item of filtered.items) {
        expect(item.marketId).toBe(marketId);
      }
    });
  });
});
