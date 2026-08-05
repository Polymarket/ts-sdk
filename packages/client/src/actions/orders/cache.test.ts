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
const METADATA_TTL_MS = 10 * 60 * 1000;

const market: MarketInfo = {
  feeInfo: { exponent: 1, rate: 0.02 },
  negRisk: false,
  tickSize: 0.01,
  tokens: [
    { outcome: 'Yes', tokenId: TOKEN_YES },
    { outcome: 'No', tokenId: TOKEN_NO },
  ],
};

describe('OrderMetadataCache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches market metadata and warms sibling token mappings', async () => {
    const { cache, deps } = createCache();

    expect(await cache.resolveMarket(TOKEN_YES)).toEqual({
      feeInfo: market.feeInfo,
      negRisk: false,
      tickSize: 0.01,
    });
    await cache.resolveMarket(TOKEN_YES);
    await cache.resolveMarket(TOKEN_NO);

    expect(deps.resolveCondition).toHaveBeenCalledTimes(1);
    expect(deps.fetchMarket).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent cold reads', async () => {
    const { cache, deps } = createCache();

    await Promise.all([
      cache.resolveMarket(TOKEN_YES),
      cache.resolveMarket(TOKEN_YES),
    ]);

    expect(deps.resolveCondition).toHaveBeenCalledTimes(1);
    expect(deps.fetchMarket).toHaveBeenCalledTimes(1);
  });

  it('evicts rejected reads so the next call retries', async () => {
    const { cache, deps } = createCache();
    deps.fetchMarket.mockRejectedValueOnce(new Error('boom'));

    await expect(cache.resolveMarket(TOKEN_YES)).rejects.toThrow('boom');
    await expect(cache.resolveMarket(TOKEN_YES)).resolves.toEqual({
      feeInfo: market.feeInfo,
      negRisk: false,
      tickSize: 0.01,
    });

    expect(deps.resolveCondition).toHaveBeenCalledTimes(1);
    expect(deps.fetchMarket).toHaveBeenCalledTimes(2);
  });

  it('refreshes expired market metadata without resolving the condition again', async () => {
    vi.useFakeTimers();
    const { cache, deps } = createCache();

    await cache.resolveMarket(TOKEN_YES);
    vi.advanceTimersByTime(METADATA_TTL_MS + 1);
    deps.fetchMarket.mockResolvedValueOnce({ ...market, tickSize: 0.001 });

    expect(await cache.resolveMarket(TOKEN_YES)).toEqual({
      feeInfo: market.feeInfo,
      negRisk: false,
      tickSize: 0.001,
    });
    expect(deps.resolveCondition).toHaveBeenCalledTimes(1);
    expect(deps.fetchMarket).toHaveBeenCalledTimes(2);
  });

  it('rejects inconsistent token-to-market responses without caching the token mapping', async () => {
    const { cache, deps } = createCache();

    await expect(cache.resolveMarket(STRAY_TOKEN)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
    await expect(cache.resolveMarket(STRAY_TOKEN)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );

    expect(deps.resolveCondition).toHaveBeenCalledTimes(2);
    expect(deps.fetchMarket).toHaveBeenCalledTimes(2);
  });

  it('fetches current metadata on every sequential read and updates the cache', async () => {
    const { cache, deps } = createCache();

    await cache.resolveMarket(TOKEN_YES);
    deps.fetchMarket.mockResolvedValueOnce({ ...market, tickSize: 0.001 });
    expect(await cache.fetchCurrentMarket(TOKEN_YES)).toEqual({
      feeInfo: market.feeInfo,
      negRisk: false,
      tickSize: 0.001,
    });
    await cache.fetchCurrentMarket(TOKEN_YES);
    expect(await cache.resolveMarket(TOKEN_YES)).toEqual({
      feeInfo: market.feeInfo,
      negRisk: false,
      tickSize: 0.01,
    });

    expect(deps.resolveCondition).toHaveBeenCalledTimes(1);
    expect(deps.fetchMarket).toHaveBeenCalledTimes(3);
  });

  it('caches builder taker fees until the metadata TTL expires', async () => {
    vi.useFakeTimers();
    const { cache, deps } = createCache();

    expect(await cache.resolveBuilderTakerFeeRate(undefined)).toBe(0);
    expect(await cache.resolveBuilderTakerFeeRate(BUILDER_CODE)).toBe(0.01);
    expect(await cache.resolveBuilderTakerFeeRate(BUILDER_CODE)).toBe(0.01);
    expect(deps.fetchBuilderTakerFeeRate).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(METADATA_TTL_MS + 1);
    deps.fetchBuilderTakerFeeRate.mockResolvedValueOnce(0.02);

    expect(await cache.resolveBuilderTakerFeeRate(BUILDER_CODE)).toBe(0.02);
    expect(deps.fetchBuilderTakerFeeRate).toHaveBeenCalledTimes(2);
  });
});

function createCache() {
  const deps = {
    fetchBuilderTakerFeeRate: vi.fn(async () => 0.01),
    fetchMarket: vi.fn(async () => market),
    resolveCondition: vi.fn(async () => CONDITION_ID),
  };

  return { cache: new OrderMetadataCache(deps), deps };
}
