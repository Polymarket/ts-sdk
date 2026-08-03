import type {
  BuilderCode,
  CtfConditionId,
  TickSizeValue,
} from '@polymarket/bindings';
import type { BuilderFeeRates, MarketFeeInfo } from '@polymarket/bindings/clob';
import type { BaseClient } from '../../clients';
import { UnexpectedResponseError } from '../../errors';
import {
  fetchBuilderFeeRates,
  fetchMarketInfo,
  resolveConditionByToken,
} from '../clob';

/**
 * Order-flow metadata cache.
 *
 * Keeps per-client caches of slow-moving market metadata (tick size, neg-risk
 * flag, condition ID, platform fee info) and builder fee rates so repeated
 * orders on the same market avoid redundant round trips. A single market-info
 * request warms every token of the market.
 *
 * Freshness is split by mutability: condition IDs and neg-risk flags are
 * immutable and cached for the client lifetime, while tick sizes, platform
 * fee info, and builder fee rates can change server-side and are refreshed
 * lazily after an internal TTL. There is deliberately no public configuration
 * surface.
 *
 * Cache state hangs off a module-level WeakMap keyed by the client instance,
 * so clients stay unaware of caching and state is collected together with the
 * client. Note that `beginAuthentication` creates a new secure client from a
 * public client, so cache state does not transfer across that boundary; the
 * order flow only runs on secure clients, so this has no practical impact.
 */

const MUTABLE_METADATA_TTL_MS = 10 * 60 * 1000;

export type MarketMeta = {
  conditionId: CtfConditionId;
  feeInfo: MarketFeeInfo;
  negRisk: boolean;
  tickSize: TickSizeValue;
};

type MarketEntry = {
  feeInfo: MarketFeeInfo;
  fetchedAt: number;
  negRisk: boolean;
  tickSize: TickSizeValue;
  tokenIds: ReadonlySet<string>;
};

type BuilderFeesEntry = {
  fetchedAt: number;
  rates: BuilderFeeRates;
};

type CacheState = {
  builderFees: Map<string, BuilderFeesEntry>;
  builderFetches: Map<string, Promise<BuilderFeeRates>>;
  conditionByToken: Map<string, CtfConditionId>;
  conditionFetches: Map<string, Promise<CtfConditionId>>;
  marketFetches: Map<string, Promise<MarketEntry>>;
  markets: Map<string, MarketEntry>;
};

const cacheStates = new WeakMap<BaseClient, CacheState>();

function resolveCacheState(client: BaseClient): CacheState {
  const existing = cacheStates.get(client);

  if (existing !== undefined) {
    return existing;
  }

  const created: CacheState = {
    builderFees: new Map(),
    builderFetches: new Map(),
    conditionByToken: new Map(),
    conditionFetches: new Map(),
    marketFetches: new Map(),
    markets: new Map(),
  };
  cacheStates.set(client, created);

  return created;
}

function isFresh(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < MUTABLE_METADATA_TTL_MS;
}

/**
 * Shares one in-flight request per key. Settled promises are always evicted
 * from the in-flight map, so a transient failure never poisons a key: results
 * live in the value caches, which only successful fetches populate.
 */
function dedupeInFlight<TValue>(
  fetches: Map<string, Promise<TValue>>,
  key: string,
  start: () => Promise<TValue>,
): Promise<TValue> {
  const pending = fetches.get(key);

  if (pending !== undefined) {
    return pending;
  }

  const started = start().finally(() => {
    fetches.delete(key);
  });
  fetches.set(key, started);

  return started;
}

/**
 * Resolves cached market metadata for a token, fetching and warming the cache
 * on a miss or after the mutable-field TTL expires.
 *
 * A cold token costs two sequential requests (token-to-condition resolution,
 * then market info); the market info warms every token of the market. A TTL
 * refresh costs one request. Warm lookups make no requests.
 *
 * @internal
 */
export async function ensureMarketMeta(
  client: BaseClient,
  tokenId: string,
): Promise<MarketMeta> {
  const state = resolveCacheState(client);
  const cachedConditionId = state.conditionByToken.get(tokenId);

  if (cachedConditionId !== undefined) {
    const entry = state.markets.get(cachedConditionId);

    if (entry !== undefined && isFresh(entry.fetchedAt)) {
      return toMarketMeta(cachedConditionId, entry);
    }

    const refreshed = await refreshMarket(client, state, cachedConditionId);

    return toMarketMeta(cachedConditionId, refreshed);
  }

  const conditionId = await dedupeInFlight(
    state.conditionFetches,
    tokenId,
    () => resolveConditionByToken(client, { tokenId }),
  );
  const entry = await refreshMarket(client, state, conditionId);

  if (!entry.tokenIds.has(tokenId)) {
    // Inconsistent upstream data: the market resolved for this token does not
    // include it. Nothing was cached for this token (refreshMarket only maps
    // tokens present in the market), so a later call re-resolves from scratch
    // instead of signing with another market's tick size or exchange.
    throw new UnexpectedResponseError(
      `Market ${conditionId} does not include token ${tokenId}.`,
    );
  }

  return toMarketMeta(conditionId, entry);
}

/**
 * Resolves cached builder fee rates for a builder code, fetching on a miss or
 * after the TTL expires.
 *
 * @internal
 */
export async function ensureBuilderFeeRates(
  client: BaseClient,
  builderCode: BuilderCode,
): Promise<BuilderFeeRates> {
  const state = resolveCacheState(client);
  const entry = state.builderFees.get(builderCode);

  if (entry !== undefined && isFresh(entry.fetchedAt)) {
    return entry.rates;
  }

  return dedupeInFlight(state.builderFetches, builderCode, async () => {
    const rates = await fetchBuilderFeeRates(client, { builderCode });
    state.builderFees.set(builderCode, { fetchedAt: Date.now(), rates });

    return rates;
  });
}

function refreshMarket(
  client: BaseClient,
  state: CacheState,
  conditionId: CtfConditionId,
): Promise<MarketEntry> {
  return dedupeInFlight(state.marketFetches, conditionId, async () => {
    const marketInfo = await fetchMarketInfo(client, { conditionId });
    const entry: MarketEntry = {
      feeInfo: marketInfo.feeInfo,
      fetchedAt: Date.now(),
      negRisk: marketInfo.negRisk,
      tickSize: marketInfo.tickSize,
      tokenIds: new Set(marketInfo.tokens.map((token) => token.tokenId)),
    };

    state.markets.set(conditionId, entry);

    for (const marketTokenId of entry.tokenIds) {
      state.conditionByToken.set(marketTokenId, conditionId);
    }

    return entry;
  });
}

function toMarketMeta(
  conditionId: CtfConditionId,
  entry: MarketEntry,
): MarketMeta {
  return {
    conditionId,
    feeInfo: entry.feeInfo,
    negRisk: entry.negRisk,
    tickSize: entry.tickSize,
  };
}
