import { OrderSide } from '@polymarket/bindings';
import { createPublicClient, RequestAbortedError } from '@polymarket/client';
import { describe, expect, it } from './fixtures';

describe('Data pagination', () => {
  it('keeps cancellation on cursor continuations and stops before another page', async ({
    environment,
  }) => {
    const client = createPublicClient({ environment });
    const controller = new AbortController();
    const paginator = client.listTrades(
      { pageSize: 2, side: OrderSide.BUY },
      { signal: controller.signal },
    );
    const first = await paginator.firstPage();
    expect(first.nextCursor).toBeDefined();
    const continuation = paginator.from(first.nextCursor);
    const second = await continuation.firstPage();
    expect(second.items).toHaveLength(2);
    expect(second.items.every((trade) => trade.side === OrderSide.BUY)).toBe(
      true,
    );
    controller.abort('query disposed');

    await expect(
      continuation.from(second.nextCursor).firstPage(),
    ).rejects.toMatchObject({
      name: 'RequestAbortedError',
      cause: 'query disposed',
    });
    // A terminal cursor never starts an operation, even after cancellation.
    await expect(paginator.from(undefined).firstPage()).resolves.toMatchObject({
      items: [],
      hasMore: false,
    });
  });

  it('rejects an unfinished for-await traversal after cancellation', async ({
    environment,
  }) => {
    const client = createPublicClient({ environment });
    const controller = new AbortController();
    let pages = 0;

    async function consume() {
      for await (const page of client.listTrades(
        { pageSize: 2 },
        { signal: controller.signal },
      )) {
        expect(page.items).toHaveLength(2);
        pages += 1;
        controller.abort();
      }
    }

    await expect(consume()).rejects.toBeInstanceOf(RequestAbortedError);
    expect(pages).toBe(1);
  });

  it('walks consecutive pages with for await and re-sends filters', async ({
    publicClient,
  }) => {
    const paginator = publicClient.listTrades({
      pageSize: 5,
      side: OrderSide.BUY,
    });

    const pages = [];
    for await (const page of paginator) {
      pages.push(page);
      if (pages.length === 3) {
        break;
      }
    }

    expect(pages).toHaveLength(3);
    for (const page of pages) {
      expect(page.items).toHaveLength(5);
      expect(page.hasMore).toBe(true);
      expect(page.nextCursor).toEqual(expect.any(String));
      // The cursor carries only the paging anchor, so BUY rows on every page
      // prove the original filters were re-sent with each continuation.
      for (const trade of page.items) {
        expect(trade.side).toBe('BUY');
      }
    }

    // Server-minted cursors advance — three pages, three distinct cursors.
    expect(new Set(pages.map((page) => page.nextCursor)).size).toBe(3);

    // The feed is newest-first and the keyset anchor is stable, so
    // timestamps never increase across the whole walk.
    const timestamps = pages.flatMap((page) =>
      page.items.map((trade) => trade.timestamp),
    );
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });

  it('continues from a first-page cursor', async ({ publicClient }) => {
    const paginator = publicClient.listTrades({ pageSize: 5 });
    const firstPage = await paginator.firstPage();

    expect(firstPage.items).toHaveLength(5);
    expect(firstPage.nextCursor).toBeDefined();

    const secondPage = await paginator.from(firstPage.nextCursor).firstPage();

    expect(secondPage.items).toHaveLength(5);
    const lastOfFirst = firstPage.items[firstPage.items.length - 1];
    const firstOfSecond = secondPage.items[0];
    expect(lastOfFirst).toBeDefined();
    expect(firstOfSecond).toBeDefined();
    expect(firstOfSecond?.timestamp).toBeLessThanOrEqual(
      lastOfFirst?.timestamp ?? 0,
    );
  });
});
