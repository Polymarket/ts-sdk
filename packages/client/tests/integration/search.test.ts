import { toPaginationCursor } from '@polymarket/bindings';
import {
  type Page,
  PaginationLimitError,
  SearchError,
  SearchSort,
  UserInputError,
} from '@polymarket/client';
import type { SearchResults } from '@polymarket/client/actions';
import { afterEach, vi } from 'vitest';
import { describe, expect, it } from './fixtures';

describe('Search', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

    it('stops normally after the deepest supported search page', async ({
      publicClient,
    }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const cursor = toPaginationCursor(
        btoa(JSON.stringify({ offset: 100, pageSize: 1 })),
      );

      const paginator = publicClient.search({
        q: 'trump',
        pageSize: 1,
        cursor,
      });
      const pages: Page<SearchResults>[] = [];
      for await (const page of paginator) {
        pages.push(page);
      }

      expect(pages).toHaveLength(1);
      expect(pages[0]).toEqual(
        expect.objectContaining({ hasMore: true, limitReached: true }),
      );

      const requests = fetchSpy.mock.calls
        .map(
          ([input]) =>
            new URL(input instanceof Request ? input.url : String(input)),
        )
        .filter((url) => url.pathname === '/public-search');

      expect(requests).toHaveLength(1);
      expect(requests[0]?.searchParams.get('page')).toBe('100');
      expect(requests[0]?.searchParams.get('limit_per_type')).toBe('1');
      fetchSpy.mockClear();
      await expect(
        paginator.from(pages[0]?.nextCursor).firstPage(),
      ).rejects.toThrow(PaginationLimitError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects search pages past the depth limit before sending a request', async ({
      publicClient,
    }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const cursor = toPaginationCursor(
        btoa(JSON.stringify({ offset: 101, pageSize: 1 })),
      );
      const firstPage = publicClient
        .search({ q: 'trump', pageSize: 1, cursor })
        .firstPage();

      await expect(firstPage).rejects.toThrow(PaginationLimitError);
      await expect(firstPage).rejects.toSatisfy(SearchError.isError);
      expect(fetchSpy).not.toHaveBeenCalled();
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
