import { SearchSort, UserInputError } from '@polymarket/client';
import { describe, expect, it } from './fixtures';

describe('Search', () => {
  describe('search', () => {
    it('fetches public search results', async ({ publicClient }) => {
      const paginator = publicClient.search({
        q: 'trump',
        pageSize: 1,
        searchProfiles: true,
        searchTags: true,
        sort: SearchSort.Volume,
      });
      const firstPage = await paginator.firstPage();

      expect(firstPage).toEqual(
        expect.objectContaining({
          hasMore: expect.any(Boolean),
          items: expect.objectContaining({
            events: expect.any(Array),
            profiles: expect.any(Array),
            tags: expect.any(Array),
          }),
        }),
      );

      if (firstPage.hasMore) {
        const nextPage = await paginator.from(firstPage.nextCursor).firstPage();

        expect(nextPage.items).toEqual(
          expect.objectContaining({
            events: expect.any(Array),
            profiles: expect.any(Array),
            tags: expect.any(Array),
          }),
        );
      }
    });

    it('rejects whitespace-only queries', ({ publicClient }) => {
      expect(() => publicClient.search({ q: '   ' })).toThrow(UserInputError);
    });

    it('rejects unsupported sort fields', ({ publicClient }) => {
      expect(() =>
        publicClient.search({ q: 'trump', sort: 'recent' as SearchSort }),
      ).toThrow(UserInputError);
    });
  });
});
