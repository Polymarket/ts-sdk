import { BuilderCodeSchema } from '@polymarket/bindings';
import { errAsync, okAsync } from '@polymarket/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BaseClient } from '../../clients';
import { TransportError, UnexpectedResponseError } from '../../errors';
import { ensureBuilderFeeRates, ensureMarketMeta } from './cache';

const TOKEN_YES = '111';
const TOKEN_NO = '222';
const CONDITION_ID = `0x${'ab'.repeat(32)}`;
const BUILDER_CODE = BuilderCodeSchema.parse(`0x${'cd'.repeat(32)}`);
const OTHER_BUILDER_CODE = BuilderCodeSchema.parse(`0x${'ef'.repeat(32)}`);

const MUTABLE_METADATA_TTL_MS = 10 * 60 * 1000;

const marketWire = {
  fd: { r: 0.02, e: 1 },
  mts: 0.01,
  nr: true,
  t: [
    { t: TOKEN_YES, o: 'Yes' },
    { t: TOKEN_NO, o: 'No' },
  ],
};

const builderFeesWire = {
  builder_maker_fee_rate_bps: 100,
  builder_taker_fee_rate_bps: 200,
};

describe('ensureMarketMeta', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves market metadata for a token with two requests', async () => {
    const { client, requests } = createClient();

    const meta = await ensureMarketMeta(client, TOKEN_YES);

    expect(meta).toEqual({
      conditionId: CONDITION_ID,
      feeInfo: { rate: 0.02, exponent: 1 },
      negRisk: true,
      tickSize: 0.01,
    });
    expect(requests(`/markets-by-token/${TOKEN_YES}`)).toBe(1);
    expect(requests(`/clob-markets/${CONDITION_ID}`)).toBe(1);
  });

  it('serves repeat lookups from the cache with zero requests', async () => {
    const { client, requests, totalRequests } = createClient();

    await ensureMarketMeta(client, TOKEN_YES);
    await ensureMarketMeta(client, TOKEN_YES);
    await ensureMarketMeta(client, TOKEN_YES);

    expect(requests(`/markets-by-token/${TOKEN_YES}`)).toBe(1);
    expect(requests(`/clob-markets/${CONDITION_ID}`)).toBe(1);
    expect(totalRequests()).toBe(2);
    expect(requests('/tick-size')).toBe(0);
    expect(requests('/neg-risk')).toBe(0);
  });

  it('shares one in-flight resolution across concurrent lookups', async () => {
    const { client, requests } = createClient();

    const [first, second] = await Promise.all([
      ensureMarketMeta(client, TOKEN_YES),
      ensureMarketMeta(client, TOKEN_YES),
    ]);

    expect(first).toEqual(second);
    expect(requests(`/markets-by-token/${TOKEN_YES}`)).toBe(1);
    expect(requests(`/clob-markets/${CONDITION_ID}`)).toBe(1);
  });

  it('warms sibling tokens of the same market from one miss', async () => {
    const { client, requests, totalRequests } = createClient();

    await ensureMarketMeta(client, TOKEN_YES);
    const sibling = await ensureMarketMeta(client, TOKEN_NO);

    expect(sibling.conditionId).toBe(CONDITION_ID);
    expect(requests(`/markets-by-token/${TOKEN_NO}`)).toBe(0);
    expect(totalRequests()).toBe(2);
  });

  it('evicts failed fetches so the next lookup retries', async () => {
    const { client, requests } = createClient({
      failFirstConditionResolution: true,
    });

    await expect(ensureMarketMeta(client, TOKEN_YES)).rejects.toBeInstanceOf(
      TransportError,
    );

    const meta = await ensureMarketMeta(client, TOKEN_YES);

    expect(meta.conditionId).toBe(CONDITION_ID);
    expect(requests(`/markets-by-token/${TOKEN_YES}`)).toBe(2);
  });

  it('refreshes mutable fields after the TTL with a single market request', async () => {
    vi.useFakeTimers();
    const { client, requests } = createClient();

    await ensureMarketMeta(client, TOKEN_YES);
    vi.advanceTimersByTime(MUTABLE_METADATA_TTL_MS - 1);
    await ensureMarketMeta(client, TOKEN_YES);

    expect(requests(`/clob-markets/${CONDITION_ID}`)).toBe(1);

    vi.advanceTimersByTime(2);
    await ensureMarketMeta(client, TOKEN_YES);

    expect(requests(`/markets-by-token/${TOKEN_YES}`)).toBe(1);
    expect(requests(`/clob-markets/${CONDITION_ID}`)).toBe(2);
  });

  it('shares one refresh across concurrent sibling lookups after expiry', async () => {
    vi.useFakeTimers();
    const { client, requests } = createClient();

    await ensureMarketMeta(client, TOKEN_YES);
    vi.advanceTimersByTime(MUTABLE_METADATA_TTL_MS + 1);
    await Promise.all([
      ensureMarketMeta(client, TOKEN_YES),
      ensureMarketMeta(client, TOKEN_NO),
    ]);

    expect(requests(`/clob-markets/${CONDITION_ID}`)).toBe(2);
  });

  it('does not share cache state across client instances', async () => {
    const first = createClient();
    const second = createClient();

    await ensureMarketMeta(first.client, TOKEN_YES);
    await ensureMarketMeta(second.client, TOKEN_YES);

    expect(first.requests(`/markets-by-token/${TOKEN_YES}`)).toBe(1);
    expect(second.requests(`/markets-by-token/${TOKEN_YES}`)).toBe(1);
  });

  it('rejects and caches nothing when the market does not include the token', async () => {
    const stray = '999';
    const { client, requests } = createClient({
      conditionByToken: { [stray]: CONDITION_ID },
    });

    await expect(ensureMarketMeta(client, stray)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );

    await expect(ensureMarketMeta(client, stray)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );

    // The stray token is re-resolved from scratch on every attempt.
    expect(requests(`/markets-by-token/${stray}`)).toBe(2);
  });
});

describe('ensureBuilderFeeRates', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches builder fee rates per builder code', async () => {
    const { client, requests } = createClient();

    const rates = await ensureBuilderFeeRates(client, BUILDER_CODE);
    await ensureBuilderFeeRates(client, BUILDER_CODE);
    await ensureBuilderFeeRates(client, OTHER_BUILDER_CODE);

    expect(rates).toEqual({ maker: 0.01, taker: 0.02 });
    expect(requests(`/fees/builder-fees/${BUILDER_CODE}`)).toBe(1);
    expect(requests(`/fees/builder-fees/${OTHER_BUILDER_CODE}`)).toBe(1);
  });

  it('shares one in-flight fetch across concurrent lookups', async () => {
    const { client, requests } = createClient();

    await Promise.all([
      ensureBuilderFeeRates(client, BUILDER_CODE),
      ensureBuilderFeeRates(client, BUILDER_CODE),
    ]);

    expect(requests(`/fees/builder-fees/${BUILDER_CODE}`)).toBe(1);
  });

  it('refreshes builder fee rates after the TTL', async () => {
    vi.useFakeTimers();
    const { client, requests } = createClient();

    await ensureBuilderFeeRates(client, BUILDER_CODE);
    vi.advanceTimersByTime(MUTABLE_METADATA_TTL_MS + 1);
    await ensureBuilderFeeRates(client, BUILDER_CODE);

    expect(requests(`/fees/builder-fees/${BUILDER_CODE}`)).toBe(2);
  });
});

type CreateClientOptions = {
  /** Token-to-condition overrides served by /markets-by-token. */
  conditionByToken?: Record<string, string>;
  failFirstConditionResolution?: boolean;
};

function createClient(options: CreateClientOptions = {}) {
  let conditionResolutionFailures = options.failFirstConditionResolution
    ? 1
    : 0;

  const clobGet = vi.fn((path: string) => {
    if (path.startsWith('/markets-by-token/')) {
      if (conditionResolutionFailures > 0) {
        conditionResolutionFailures -= 1;
        return errAsync(new TransportError('boom'));
      }

      const tokenId = path.slice('/markets-by-token/'.length);
      const conditionId =
        options.conditionByToken?.[tokenId] ??
        ([TOKEN_YES, TOKEN_NO].includes(tokenId) ? CONDITION_ID : undefined);

      if (conditionId === undefined) {
        throw new Error(`Unexpected token resolution for ${tokenId}`);
      }

      return okAsync(jsonResponse({ condition_id: conditionId }));
    }

    if (path === `/clob-markets/${CONDITION_ID}`) {
      return okAsync(jsonResponse(marketWire));
    }

    if (path.startsWith('/fees/builder-fees/')) {
      return okAsync(jsonResponse(builderFeesWire));
    }

    throw new Error(`Unexpected request path: ${path}`);
  });

  const client = { clob: { get: clobGet } } as unknown as BaseClient;

  return {
    client,
    requests(prefix: string): number {
      return clobGet.mock.calls.filter(([path]) => path.startsWith(prefix))
        .length;
    },
    totalRequests(): number {
      return clobGet.mock.calls.length;
    },
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}
