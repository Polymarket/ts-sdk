import {
  dataV2EnvelopeSchema,
  dataV2PageSchema,
} from '@polymarket/bindings/data';
import { unwrap } from '@polymarket/types';
import { z } from 'zod';
import { describe, expect, it } from './fixtures';

// A wallet shape that is valid but cannot correspond to a real account.
const UNKNOWN_WALLET = '0x00000000000000000000000000000000000000aa';

describe('Data v2 envelope', () => {
  it('parses a paginated list envelope with a server-minted cursor', async ({
    publicClient,
  }) => {
    const response = await unwrap(
      publicClient.data.get('v2/leaderboard', {
        params: new URLSearchParams({ limit: '2', time_period: 'all' }),
      }),
    );

    const page = dataV2PageSchema(
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

    expect(page.data.length).toBeGreaterThan(0);
    expect(page.pagination.hasMore).toBe(true);
    expect(page.pagination.nextCursor).toEqual(expect.any(String));
  });

  it('parses a single-object envelope', async ({ publicClient }) => {
    const response = await unwrap(publicClient.data.get('v2/oi'));

    const envelope = dataV2EnvelopeSchema(
      z.array(z.object({ market_id: z.string(), value: z.number() }).loose()),
    ).parse(await response.json());

    expect(envelope.data.length).toBeGreaterThan(0);
  });

  it('keeps a null answer parsed rather than failing validation', async ({
    publicClient,
  }) => {
    const response = await unwrap(
      publicClient.data.get('v2/user-stats', {
        params: new URLSearchParams({ user: UNKNOWN_WALLET }),
      }),
    );

    const envelope = dataV2EnvelopeSchema(
      z.object({ trades: z.number().int() }).loose().nullable(),
    ).parse(await response.json());

    expect(envelope.data).toBeNull();
  });
});
