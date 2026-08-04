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
const IMMUTABLE_TTL_MS = Number.POSITIVE_INFINITY;

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
  negRisk: boolean;
  tickSize: TickSizeValue;
  tokenIds: ReadonlySet<TokenId>;
};

/**
 * A cached value is always represented by its promise, so in-flight fetches
 * and settled values live in the same structure and concurrent lookups
 * naturally join the pending fetch.
 *
 * `fetchedAt` doubles as the settlement marker: it is `undefined` while the
 * fetch is in flight and set when it resolves. Rejected entries are evicted,
 * so a transient failure never poisons a key.
 */
type CacheEntry<TValue> = {
  promise: Promise<TValue>;
  fetchedAt?: number;
};

/**
 * Self-contained cache for order-flow metadata, independent of any client
 * instance. All state is private; behavior is fully exercised through the
 * injected {@link OrderMetadataCacheDeps}.
 */
export class OrderMetadataCache {
  readonly #deps: OrderMetadataCacheDeps;

  readonly #builderFees = new Map<BuilderCode, CacheEntry<BuilderFeeRates>>();
  readonly #conditions = new Map<TokenId, CacheEntry<CtfConditionId>>();
  readonly #markets = new Map<CtfConditionId, CacheEntry<MarketEntry>>();

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
    const conditionId = await getOrFetch(
      this.#conditions,
      tokenId,
      IMMUTABLE_TTL_MS,
      () => this.#deps.resolveCondition(tokenId),
    );
    const entry = await getOrFetch(
      this.#markets,
      conditionId,
      MUTABLE_METADATA_TTL_MS,
      () => this.#fetchMarketEntry(conditionId),
    );

    if (!entry.tokenIds.has(tokenId)) {
      // Inconsistent upstream data: the market resolved for this token does
      // not include it. Evict the token's condition mapping so a later call
      // re-resolves from scratch instead of signing with another market's
      // tick size or exchange.
      this.#conditions.delete(tokenId);
      throw new UnexpectedResponseError(
        `Market ${conditionId} does not include token ${tokenId}.`,
      );
    }

    return {
      conditionId,
      feeInfo: entry.feeInfo,
      negRisk: entry.negRisk,
      tickSize: entry.tickSize,
    };
  }

  /**
   * Resolves builder fee rates for a builder code, fetching on a miss or
   * after the TTL expires.
   */
  ensureBuilderFeeRates(builderCode: BuilderCode): Promise<BuilderFeeRates> {
    return getOrFetch(
      this.#builderFees,
      builderCode,
      MUTABLE_METADATA_TTL_MS,
      () => this.#deps.fetchBuilderFees(builderCode),
    );
  }

  async #fetchMarketEntry(conditionId: CtfConditionId): Promise<MarketEntry> {
    const marketInfo = await this.#deps.fetchMarket(conditionId);
    const entry: MarketEntry = {
      feeInfo: marketInfo.feeInfo,
      negRisk: marketInfo.negRisk,
      tickSize: marketInfo.tickSize,
      tokenIds: new Set(marketInfo.tokens.map((token) => token.tokenId)),
    };

    // Warm the token-to-condition mapping for every token of the market, so
    // sibling tokens skip their own resolution round trip.
    for (const marketTokenId of entry.tokenIds) {
      this.#conditions.set(marketTokenId, {
        fetchedAt: Date.now(),
        promise: Promise.resolve(conditionId),
      });
    }

    return entry;
  }
}

/**
 * Returns the cached promise for a key, joining an in-flight fetch or a fresh
 * settled value, and otherwise starts a new fetch. Rejected fetches evict
 * their entry (unless it was already replaced) so the next lookup retries.
 */
function getOrFetch<TKey, TValue>(
  entries: Map<TKey, CacheEntry<TValue>>,
  key: TKey,
  ttlMs: number,
  start: () => Promise<TValue>,
): Promise<TValue> {
  const entry = entries.get(key);

  if (entry !== undefined && isJoinable(entry, ttlMs)) {
    return entry.promise;
  }

  const created: CacheEntry<TValue> = { promise: start() };
  created.promise.then(
    () => {
      created.fetchedAt = Date.now();
    },
    () => {
      if (entries.get(key) === created) {
        entries.delete(key);
      }
    },
  );
  entries.set(key, created);

  return created.promise;
}

/** An entry is joinable while its fetch is in flight or while it is fresh. */
function isJoinable<TValue>(entry: CacheEntry<TValue>, ttlMs: number): boolean {
  return entry.fetchedAt === undefined || Date.now() - entry.fetchedAt < ttlMs;
}

// Cache state hangs off a module-level WeakMap keyed by the client instance,
// so clients stay unaware of caching and state is collected together with the
// client. Keying by client (rather than sharing by environment) is deliberate:
// client instances are the unit that carries environment and, in the future,
// API-key configuration, and multiple clients ordering on the same market is
// an unlikely workload. Note that `beginAuthentication` creates a new secure
// client from a public client, so cache state does not transfer across that
// boundary; the order flow only runs on secure clients, so this has no
// practical impact.
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
