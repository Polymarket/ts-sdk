import type {
  BuilderCode,
  CtfConditionId,
  TickSizeValue,
  TokenId,
} from '@polymarket/bindings';
import type {
  BuilderFeeRates,
  MarketFeeInfo,
  MarketInfo,
} from '@polymarket/bindings/clob';
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
 */

const MUTABLE_METADATA_TTL_MS = 10 * 60 * 1000;

export type MarketMeta = {
  conditionId: CtfConditionId;
  feeInfo: MarketFeeInfo;
  negRisk: boolean;
  tickSize: TickSizeValue;
};

/**
 * Dependencies of {@link OrderMetadataCache}, expressed as the domain-typed
 * operations the cache consumes rather than a client or transport surface.
 * The production adapters close over a client and delegate to the
 * corresponding actions; tests can supply plain async functions.
 */
export type OrderMetadataCacheDeps = {
  fetchBuilderFees(builderCode: BuilderCode): Promise<BuilderFeeRates>;
  fetchMarket(conditionId: CtfConditionId): Promise<MarketInfo>;
  resolveCondition(tokenId: TokenId): Promise<CtfConditionId>;
};

type MarketEntry = {
  feeInfo: MarketFeeInfo;
  fetchedAt: number;
  negRisk: boolean;
  tickSize: TickSizeValue;
  tokenIds: ReadonlySet<TokenId>;
};

type BuilderFeesEntry = {
  fetchedAt: number;
  rates: BuilderFeeRates;
};

/**
 * Self-contained cache for order-flow metadata, independent of any client
 * instance. All state is private; behavior is fully exercised through the
 * injected {@link OrderMetadataCacheDeps}.
 */
export class OrderMetadataCache {
  readonly #deps: OrderMetadataCacheDeps;

  readonly #builderFees = new Map<BuilderCode, BuilderFeesEntry>();
  readonly #builderFetches = new Map<BuilderCode, Promise<BuilderFeeRates>>();
  readonly #conditionByToken = new Map<TokenId, CtfConditionId>();
  readonly #conditionFetches = new Map<TokenId, Promise<CtfConditionId>>();
  readonly #marketFetches = new Map<CtfConditionId, Promise<MarketEntry>>();
  readonly #markets = new Map<CtfConditionId, MarketEntry>();

  constructor(deps: OrderMetadataCacheDeps) {
    this.#deps = deps;
  }

  /**
   * Resolves market metadata for a token, fetching and warming the cache on a
   * miss or after the mutable-field TTL expires.
   *
   * A cold token costs two sequential fetches (token-to-condition resolution,
   * then market info); the market info warms every token of the market. A TTL
   * refresh costs one fetch. Warm lookups make none.
   */
  async ensureMarketMeta(tokenId: TokenId): Promise<MarketMeta> {
    const cachedConditionId = this.#conditionByToken.get(tokenId);

    if (cachedConditionId !== undefined) {
      const entry = this.#markets.get(cachedConditionId);

      if (entry !== undefined && isFresh(entry.fetchedAt)) {
        return toMarketMeta(cachedConditionId, entry);
      }

      const refreshed = await this.#refreshMarket(cachedConditionId);

      return toMarketMeta(cachedConditionId, refreshed);
    }

    const conditionId = await dedupeInFlight(
      this.#conditionFetches,
      tokenId,
      () => this.#deps.resolveCondition(tokenId),
    );
    const entry = await this.#refreshMarket(conditionId);

    if (!entry.tokenIds.has(tokenId)) {
      // Inconsistent upstream data: the market resolved for this token does
      // not include it. Nothing was cached for this token (refreshMarket only
      // maps tokens present in the market), so a later call re-resolves from
      // scratch instead of signing with another market's tick size or
      // exchange.
      throw new UnexpectedResponseError(
        `Market ${conditionId} does not include token ${tokenId}.`,
      );
    }

    return toMarketMeta(conditionId, entry);
  }

  /**
   * Resolves builder fee rates for a builder code, fetching on a miss or
   * after the TTL expires.
   */
  async ensureBuilderFeeRates(
    builderCode: BuilderCode,
  ): Promise<BuilderFeeRates> {
    const entry = this.#builderFees.get(builderCode);

    if (entry !== undefined && isFresh(entry.fetchedAt)) {
      return entry.rates;
    }

    return dedupeInFlight(this.#builderFetches, builderCode, async () => {
      const rates = await this.#deps.fetchBuilderFees(builderCode);
      this.#builderFees.set(builderCode, { fetchedAt: Date.now(), rates });

      return rates;
    });
  }

  #refreshMarket(conditionId: CtfConditionId): Promise<MarketEntry> {
    return dedupeInFlight(this.#marketFetches, conditionId, async () => {
      const marketInfo = await this.#deps.fetchMarket(conditionId);
      const entry: MarketEntry = {
        feeInfo: marketInfo.feeInfo,
        fetchedAt: Date.now(),
        negRisk: marketInfo.negRisk,
        tickSize: marketInfo.tickSize,
        tokenIds: new Set(marketInfo.tokens.map((token) => token.tokenId)),
      };

      this.#markets.set(conditionId, entry);

      for (const marketTokenId of entry.tokenIds) {
        this.#conditionByToken.set(marketTokenId, conditionId);
      }

      return entry;
    });
  }
}

function isFresh(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < MUTABLE_METADATA_TTL_MS;
}

/**
 * Shares one in-flight fetch per key. Settled promises are always evicted
 * from the in-flight map, so a transient failure never poisons a key: results
 * live in the value caches, which only successful fetches populate.
 */
function dedupeInFlight<TKey, TValue>(
  fetches: Map<TKey, Promise<TValue>>,
  key: TKey,
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

// Cache state hangs off a module-level WeakMap keyed by the client instance,
// so clients stay unaware of caching and state is collected together with the
// client. Note that `beginAuthentication` creates a new secure client from a
// public client, so cache state does not transfer across that boundary; the
// order flow only runs on secure clients, so this has no practical impact.
const cachesByClient = new WeakMap<BaseClient, OrderMetadataCache>();

/** @internal */
export function ensureMarketMeta(
  client: BaseClient,
  tokenId: TokenId,
): Promise<MarketMeta> {
  return resolveCache(client).ensureMarketMeta(tokenId);
}

/** @internal */
export function ensureBuilderFeeRates(
  client: BaseClient,
  builderCode: BuilderCode,
): Promise<BuilderFeeRates> {
  return resolveCache(client).ensureBuilderFeeRates(builderCode);
}

function resolveCache(client: BaseClient): OrderMetadataCache {
  const existing = cachesByClient.get(client);

  if (existing !== undefined) {
    return existing;
  }

  const created = new OrderMetadataCache({
    fetchBuilderFees: (builderCode) =>
      fetchBuilderFeeRates(client, { builderCode }),
    fetchMarket: (conditionId) => fetchMarketInfo(client, { conditionId }),
    resolveCondition: (tokenId) => resolveConditionByToken(client, { tokenId }),
  });
  cachesByClient.set(client, created);

  return created;
}
