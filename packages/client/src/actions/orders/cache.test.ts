import {
  BuilderCodeSchema,
  CtfConditionIdSchema,
  TokenIdSchema,
} from '@polymarket/bindings';
import type { MarketInfo } from '@polymarket/bindings/clob';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnexpectedResponseError } from '../../errors';
import { OrderMetadataCache } from './cache';

const TOKEN_YES = TokenIdSchema.parse('111');
const TOKEN_NO = TokenIdSchema.parse('222');
const STRAY_TOKEN = TokenIdSchema.parse('999');
const CONDITION_ID = CtfConditionIdSchema.parse(`0x${'ab'.repeat(32)}`);
const BUILDER_CODE = BuilderCodeSchema.parse(`0x${'cd'.repeat(32)}`);
const OTHER_BUILDER_CODE = BuilderCodeSchema.parse(`0x${'ef'.repeat(32)}`);

const MUTABLE_METADATA_TTL_MS = 10 * 60 * 1000;

const marketInfo: MarketInfo = {
  feeInfo: { rate: 0.02, exponent: 1 },
  negRisk: true,
  tickSize: 0.01,
  tokens: [
    { tokenId: TOKEN_YES, outcome: 'Yes' },
    { tokenId: TOKEN_NO, outcome: 'No' },
  ],
};

describe('OrderMetadataCache.ensureMarketMeta', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves market metadata for a token with one fetch of each dependency', async () => {
    const { cache, deps } = createCache();

    const meta = await cache.ensureMarketMeta(TOKEN_YES);

    expect(meta).toEqual({
      conditionId: CONDITION_ID,
      feeInfo: { rate: 0.02, exponent: 1 },
      negRisk: true,
      tickSize: 0.01,
    });
    expect(deps.resolveCondition).toHaveBeenCalledTimes(1);
    expect(deps.fetchMarket).toHaveBeenCalledTimes(1);
  });

  it('serves repeat lookups from the cache without fetching', async () => {
    const { cache, deps } = createCache();

    await cache.ensureMarketMeta(TOKEN_YES);
    await cache.ensureMarketMeta(TOKEN_YES);
    await cache.ensureMarketMeta(TOKEN_YES);

    expect(deps.resolveCondition).toHaveBeenCalledTimes(1);
    expect(deps.fetchMarket).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight resolution across concurrent lookups', async () => {
    const { cache, deps } = createCache();

    const [first, second] = await Promise.all([
      cache.ensureMarketMeta(TOKEN_YES),
      cache.ensureMarketMeta(TOKEN_YES),
    ]);

    expect(first).toEqual(second);
    expect(deps.resolveCondition).toHaveBeenCalledTimes(1);
    expect(deps.fetchMarket).toHaveBeenCalledTimes(1);
  });

  it('warms sibling tokens of the same market from one miss', async () => {
    const { cache, deps } = createCache();

    await cache.ensureMarketMeta(TOKEN_YES);
    const sibling = await cache.ensureMarketMeta(TOKEN_NO);

    expect(sibling.conditionId).toBe(CONDITION_ID);
    expect(deps.resolveCondition).toHaveBeenCalledTimes(1);
    expect(deps.resolveCondition).not.toHaveBeenCalledWith(TOKEN_NO);
    expect(deps.fetchMarket).toHaveBeenCalledTimes(1);
  });

  it('evicts a failed condition resolution so the next lookup retries', async () => {
    const { cache, deps } = createCache();
    deps.resolveCondition.mockRejectedValueOnce(new Error('boom'));

    await expect(cache.ensureMarketMeta(TOKEN_YES)).rejects.toThrow('boom');

    const meta = await cache.ensureMarketMeta(TOKEN_YES);

    expect(meta.conditionId).toBe(CONDITION_ID);
    expect(deps.resolveCondition).toHaveBeenCalledTimes(2);
  });

  it('evicts a failed market fetch so the next lookup retries', async () => {
    const { cache, deps } = createCache();
    deps.fetchMarket.mockRejectedValueOnce(new Error('boom'));

    await expect(cache.ensureMarketMeta(TOKEN_YES)).rejects.toThrow('boom');

    const meta = await cache.ensureMarketMeta(TOKEN_YES);

    expect(meta.tickSize).toBe(0.01);
    expect(deps.fetchMarket).toHaveBeenCalledTimes(2);
  });

  it('refreshes mutable fields after the TTL without re-resolving the condition', async () => {
    vi.useFakeTimers();
    const { cache, deps } = createCache();

    await cache.ensureMarketMeta(TOKEN_YES);
    vi.advanceTimersByTime(MUTABLE_METADATA_TTL_MS - 1);
    await cache.ensureMarketMeta(TOKEN_YES);

    expect(deps.fetchMarket).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2);
    deps.fetchMarket.mockResolvedValueOnce({ ...marketInfo, tickSize: 0.001 });
    const refreshed = await cache.ensureMarketMeta(TOKEN_YES);

    expect(refreshed.tickSize).toBe(0.001);
    expect(deps.fetchMarket).toHaveBeenCalledTimes(2);
    expect(deps.resolveCondition).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh across concurrent sibling lookups after expiry', async () => {
    vi.useFakeTimers();
    const { cache, deps } = createCache();

    await cache.ensureMarketMeta(TOKEN_YES);
    vi.advanceTimersByTime(MUTABLE_METADATA_TTL_MS + 1);
    await Promise.all([
      cache.ensureMarketMeta(TOKEN_YES),
      cache.ensureMarketMeta(TOKEN_NO),
    ]);

    expect(deps.fetchMarket).toHaveBeenCalledTimes(2);
  });

  it('rejects and caches nothing when the market does not include the token', async () => {
    const { cache, deps } = createCache();

    await expect(cache.ensureMarketMeta(STRAY_TOKEN)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
    await expect(cache.ensureMarketMeta(STRAY_TOKEN)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );

    // The stray token is re-resolved from scratch on every attempt.
    expect(deps.resolveCondition).toHaveBeenCalledTimes(2);
  });
});

describe('OrderMetadataCache.refreshMarketMeta', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the cached entry without refetching within the refresh holdoff', async () => {
    vi.useFakeTimers();
    const { cache, deps } = createCache();

    await cache.ensureMarketMeta(TOKEN_YES);
    vi.advanceTimersByTime(4_000);
    const meta = await cache.refreshMarketMeta(TOKEN_YES);

    expect(meta.tickSize).toBe(0.01);
    expect(deps.fetchMarket).toHaveBeenCalledTimes(1);
  });

  it('refetches ahead of the TTL once past the holdoff, without re-resolving the condition', async () => {
    vi.useFakeTimers();
    const { cache, deps } = createCache();

    await cache.ensureMarketMeta(TOKEN_YES);
    vi.advanceTimersByTime(6_000);
    deps.fetchMarket.mockResolvedValueOnce({ ...marketInfo, tickSize: 0.001 });
    const meta = await cache.refreshMarketMeta(TOKEN_YES);

    expect(meta.tickSize).toBe(0.001);
    expect(deps.fetchMarket).toHaveBeenCalledTimes(2);
    expect(deps.resolveCondition).toHaveBeenCalledTimes(1);
  });

  it('behaves like a cold lookup for an unseen token', async () => {
    const { cache, deps } = createCache();

    const meta = await cache.refreshMarketMeta(TOKEN_YES);

    expect(meta.conditionId).toBe(CONDITION_ID);
    expect(deps.resolveCondition).toHaveBeenCalledTimes(1);
    expect(deps.fetchMarket).toHaveBeenCalledTimes(1);
  });
});

describe('OrderMetadataCache.ensureBuilderFeeRates', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches builder fee rates per builder code', async () => {
    const { cache, deps } = createCache();

    const rates = await cache.ensureBuilderFeeRates(BUILDER_CODE);
    await cache.ensureBuilderFeeRates(BUILDER_CODE);
    await cache.ensureBuilderFeeRates(OTHER_BUILDER_CODE);

    expect(rates).toEqual({ maker: 0.01, taker: 0.02 });
    expect(deps.fetchBuilderFees).toHaveBeenCalledTimes(2);
    expect(deps.fetchBuilderFees).toHaveBeenCalledWith(BUILDER_CODE);
    expect(deps.fetchBuilderFees).toHaveBeenCalledWith(OTHER_BUILDER_CODE);
  });

  it('shares one in-flight fetch across concurrent lookups', async () => {
    const { cache, deps } = createCache();

    await Promise.all([
      cache.ensureBuilderFeeRates(BUILDER_CODE),
      cache.ensureBuilderFeeRates(BUILDER_CODE),
    ]);

    expect(deps.fetchBuilderFees).toHaveBeenCalledTimes(1);
  });

  it('evicts a failed fetch so the next lookup retries', async () => {
    const { cache, deps } = createCache();
    deps.fetchBuilderFees.mockRejectedValueOnce(new Error('boom'));

    await expect(cache.ensureBuilderFeeRates(BUILDER_CODE)).rejects.toThrow(
      'boom',
    );

    const rates = await cache.ensureBuilderFeeRates(BUILDER_CODE);

    expect(rates).toEqual({ maker: 0.01, taker: 0.02 });
    expect(deps.fetchBuilderFees).toHaveBeenCalledTimes(2);
  });

  it('refreshes builder fee rates after the TTL', async () => {
    vi.useFakeTimers();
    const { cache, deps } = createCache();

    await cache.ensureBuilderFeeRates(BUILDER_CODE);
    vi.advanceTimersByTime(MUTABLE_METADATA_TTL_MS - 1);
    await cache.ensureBuilderFeeRates(BUILDER_CODE);

    expect(deps.fetchBuilderFees).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2);
    await cache.ensureBuilderFeeRates(BUILDER_CODE);

    expect(deps.fetchBuilderFees).toHaveBeenCalledTimes(2);
  });
});

function createCache() {
  const deps = {
    fetchBuilderFees: vi.fn(async () => ({ maker: 0.01, taker: 0.02 })),
    fetchMarket: vi.fn(async () => marketInfo),
    resolveCondition: vi.fn(async () => CONDITION_ID),
  };

  return { cache: new OrderMetadataCache(deps), deps };
}
