import { describe, expect, it } from './fixtures';
import { expectNonEmptyPage, expectPageWindow } from './helpers';

describe('Teams', () => {
  describe('listTeams', () => {
    it('fetches teams', async ({ publicClient }) => {
      const paginator = publicClient.listTeams({
        pageSize: 100,
      });
      const result = await paginator.firstPage().then(expectNonEmptyPage);

      expect(result.items.length).toBeGreaterThan(0);
      await expectPageWindow(paginator, result, 99);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
        }),
      );
    });
  });
});
