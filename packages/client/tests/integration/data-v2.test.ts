import {
  dataV2EnvelopeSchema,
  dataV2PageSchema,
} from '@polymarket/bindings/data';
import type { Page } from '@polymarket/client';
import { unwrap } from '@polymarket/types';
import { z } from 'zod';
import { describe, expect, it } from './fixtures';

// A wallet shape that is valid but cannot correspond to a real account.
const UNKNOWN_WALLET = '0x00000000000000000000000000000000000000aa';

const LeaderboardEntrySchema = z
  .object({
    rank: z.number().int(),
    user_id: z.string(),
    pnl: z.number(),
    volume: z.number(),
    verified: z.boolean(),
  })
  .loose();

describe('Data v2 envelope', () => {
  it('parses a paginated list envelope into the page shape', async ({
    publicClient,
  }) => {
    const response = await unwrap(
      publicClient.data.get('v2/leaderboard', {
        params: new URLSearchParams({ limit: '2', time_period: 'all' }),
      }),
    );

    const page = dataV2PageSchema(LeaderboardEntrySchema).parse(
      await response.json(),
    );

    // The schema output IS the SDK page shape — no re-mapping between the
    // envelope and the pagination walker.
    const asPage: Page<Array<z.output<typeof LeaderboardEntrySchema>>> = page;

    expect(asPage.items.length).toBeGreaterThan(0);
    expect(asPage.hasMore).toBe(true);
    expect(asPage.nextCursor).toEqual(expect.any(String));
  });

  it('unwraps a single-object envelope to the payload', async ({
    publicClient,
  }) => {
    const response = await unwrap(publicClient.data.get('v2/oi'));

    const markets = dataV2EnvelopeSchema(
      z.array(z.object({ market_id: z.string(), value: z.number() }).loose()),
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

    const stats = dataV2EnvelopeSchema(
      z.object({ trades: z.number().int() }).loose().nullable(),
    ).parse(await response.json());

    expect(stats).toBeNull();
  });
});
