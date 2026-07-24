import { describe, expect, it } from './fixtures';
import { expectNonEmptyPage, expectPageWindow } from './helpers';

describe('Series', () => {
  describe('listSeries', () => {
    it('fetches series', async ({ publicClient }) => {
      const paginator = publicClient.listSeries({
        pageSize: 50,
      });
      const result = await paginator.firstPage().then(expectNonEmptyPage);

      expect(result.items.length).toBeGreaterThan(0);
      await expectPageWindow(paginator, result, 99);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
        }),
      );
    });
  });

  describe('fetchSeries', () => {
    it('fetches a series by id', async ({ publicClient }) => {
      const {
        items: [series],
      } = await publicClient
        .listSeries({
          pageSize: 1,
        })
        .firstPage()
        .then(expectNonEmptyPage);

      const result = await publicClient.fetchSeries({
        id: series.id,
      });

      expect(result.id).toBe(series.id);
    });
  });
});
