import type {
  BaseClient,
  Page,
  Paginated,
  PaginationCursor,
} from '@polymarket/client';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createConfig } from './config';
import { PolymarketProvider } from './context';
import { usePublicPaginatedAction } from './pagination';
import type { Skip } from './skip';
import { skip } from './skip';

const config = createConfig();

function wrapper({ children }: { children: ReactNode }) {
  return <PolymarketProvider config={config}>{children}</PolymarketProvider>;
}

type TestRequest = { list: string };

function stubPaginator<TItem>(pages: TItem[][], start = 0): Paginated<TItem[]> {
  async function fetchPage(index: number): Promise<Page<TItem[]>> {
    const items = pages[index] ?? [];
    const hasMore = index < pages.length - 1;

    return {
      items,
      hasMore,
      nextCursor: hasMore ? (String(index + 1) as PaginationCursor) : undefined,
    };
  }

  return {
    firstPage: () => fetchPage(start),
    from: (cursor?: PaginationCursor) =>
      cursor === undefined
        ? stubPaginator([], 0)
        : stubPaginator(pages, Number(cursor)),
    async *[Symbol.asyncIterator]() {
      let index = start;

      while (true) {
        const page = await fetchPage(index);
        yield page;

        if (!page.hasMore) {
          break;
        }

        index += 1;
      }
    },
  };
}

describe('usePublicPaginatedAction', () => {
  it('loads the first page and accumulates following pages', async () => {
    const pages = [[1, 2], [3, 4], [5]];

    function action(_client: BaseClient, _request: TestRequest) {
      return stubPaginator(pages);
    }

    const { result } = renderHook(
      () => usePublicPaginatedAction(action, { list: 'numbers' }),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.data).toEqual([1, 2]));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(result.current.data).toEqual([1, 2, 3, 4]);
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(result.current.data).toEqual([1, 2, 3, 4, 5]);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('is a no-op to fetch the next page when exhausted', async () => {
    const action = vi.fn((_client: BaseClient, _request: TestRequest) =>
      stubPaginator([[1]]),
    );

    const { result } = renderHook(
      () => usePublicPaginatedAction(action, { list: 'numbers' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual([1]));
    expect(result.current.hasNextPage).toBe(false);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(result.current.data).toEqual([1]);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('resets to the first page on refetch', async () => {
    const pages = [
      [1, 2],
      [3, 4],
    ];

    function action(_client: BaseClient, _request: TestRequest) {
      return stubPaginator(pages);
    }

    const { result } = renderHook(
      () => usePublicPaginatedAction(action, { list: 'numbers' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual([1, 2]));

    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(result.current.data).toEqual([1, 2, 3, 4]);

    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.data).toEqual([1, 2]);
    expect(result.current.hasNextPage).toBe(true);
  });

  it('resets when the request changes', async () => {
    function action(_client: BaseClient, request: TestRequest) {
      return stubPaginator(request.list === 'a' ? [[1], [2]] : [[9]]);
    }

    const { result, rerender } = renderHook(
      ({ list }: { list: string }) =>
        usePublicPaginatedAction(action, { list }),
      { wrapper, initialProps: { list: 'a' } },
    );

    await waitFor(() => expect(result.current.data).toEqual([1]));

    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(result.current.data).toEqual([1, 2]);

    rerender({ list: 'b' });

    await waitFor(() => expect(result.current.data).toEqual([9]));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('surfaces first page errors on `error`', async () => {
    const failure = new Error('bad request');

    function action(
      _client: BaseClient,
      _request: TestRequest,
    ): Paginated<number[]> {
      throw failure;
    }

    const { result } = renderHook(
      () => usePublicPaginatedAction(action, { list: 'numbers' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps accumulated items when a next page fetch fails', async () => {
    const failure = new Error('page failed');

    function action(
      _client: BaseClient,
      _request: TestRequest,
    ): Paginated<number[]> {
      const paginator = stubPaginator([[1, 2], [3]]);

      return {
        ...paginator,
        from: () => ({
          ...paginator,
          firstPage: () => Promise.reject(failure),
        }),
      };
    }

    const { result } = renderHook(
      () => usePublicPaginatedAction(action, { list: 'numbers' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual([1, 2]));

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(result.current.data).toEqual([1, 2]);
    expect(result.current.error).toBe(failure);
    expect(result.current.isFetchingNextPage).toBe(false);
  });

  it('pauses with `skip` and resumes when a request is provided', async () => {
    const action = vi.fn((_client: BaseClient, _request: TestRequest) =>
      stubPaginator([[1]]),
    );

    const { result, rerender } = renderHook(
      ({ request }: { request: TestRequest | Skip }) =>
        usePublicPaginatedAction(action, request),
      { wrapper, initialProps: { request: skip as TestRequest | Skip } },
    );

    expect(result.current.isPaused).toBe(true);
    expect(action).not.toHaveBeenCalled();

    rerender({ request: { list: 'numbers' } });

    await waitFor(() => expect(result.current.data).toEqual([1]));
    expect(result.current.isPaused).toBe(false);
  });
});
