import { OrderSide } from '@polymarket/bindings';
import { dataEnvelopeSchema, dataPageSchema } from '@polymarket/bindings/data';
import { unwrap } from '@polymarket/types';
import { z } from 'zod';
import { describe, expect, it } from './fixtures';

// A wallet shape that is valid but cannot correspond to a real account.
const UNKNOWN_WALLET = '0x00000000000000000000000000000000000000aa';

describe('Data pagination', () => {
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

/**
 * Envelope-level coverage for v2 surfaces that have no public action yet.
 * Each block below folds into its action's integration test as the
 * corresponding endpoint lands in the SDK.
 */
describe('Data envelope', () => {
  it('parses a paginated list envelope into the page shape', async ({
    publicClient,
  }) => {
    const response = await unwrap(
      publicClient.data.get('v2/leaderboard', {
        params: new URLSearchParams({ limit: '2', time_period: 'all' }),
      }),
    );

    const page = dataPageSchema(
      z
        .object({
          rank: z.number().int(),
          user_id: z.string(),
          pnl: z.number(),
          volume: z.number(),
          verified: z.boolean(),
        })
        .loose(),
    ).parse(await response.json());

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  it('unwraps a single-object envelope to the payload', async ({
    publicClient,
  }) => {
    const response = await unwrap(publicClient.data.get('v2/oi'));

    const markets = dataEnvelopeSchema(
      z.array(
        z.object({ condition_id: z.string(), value: z.number() }).loose(),
      ),
    ).parse(await response.json());

    expect(markets.length).toBeGreaterThan(0);
  });

  it('keeps a null answer parsed rather than failing validation', async ({
    publicClient,
  }) => {
    const response = await unwrap(
      publicClient.data.get('v2/user-stats', {
        params: new URLSearchParams({ user: UNKNOWN_WALLET }),
      }),
    );

    const stats = dataEnvelopeSchema(
      z.object({ trades: z.number().int() }).loose().nullable(),
    ).parse(await response.json());

    expect(stats).toBeNull();
  });
});
