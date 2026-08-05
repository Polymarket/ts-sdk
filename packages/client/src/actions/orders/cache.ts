import type {
  BuilderCode,
  CtfConditionId,
  TickSizeValue,
  TokenId,
} from '@polymarket/bindings';
import type { MarketFeeInfo, MarketInfo } from '@polymarket/bindings/clob';
import type { BaseClient } from '../../clients';
import { UnexpectedResponseError } from '../../errors';
import {
  fetchBuilderFeeRates,
  fetchMarketInfo,
  resolveConditionByToken,
} from '../clob';

const METADATA_TTL_MS = 10 * 60 * 1000;
const IMMUTABLE_TTL_MS = Number.POSITIVE_INFINITY;

/** @internal */
export type OrderMarketMetadata = {
  feeInfo: MarketFeeInfo;
  negRisk: boolean;
  tickSize: TickSizeValue;
};

/** @internal */
export type OrderMetadataCacheDeps = {
  fetchBuilderTakerFeeRate(builderCode: BuilderCode): Promise<number>;
  fetchMarket(conditionId: CtfConditionId): Promise<MarketInfo>;
  resolveCondition(tokenId: TokenId): Promise<CtfConditionId>;
};

type MarketRecord = OrderMarketMetadata & {
  tokenIds: ReadonlySet<TokenId>;
};

type CacheEntry<TValue> = {
  expiresAt?: number;
  promise: Promise<TValue>;
};

/** @internal */
export class OrderMetadataCache {
  readonly #deps: OrderMetadataCacheDeps;
  readonly #builderTakerFeeRates = new Map<BuilderCode, CacheEntry<number>>();
  readonly #conditions = new Map<TokenId, CacheEntry<CtfConditionId>>();
  readonly #markets = new Map<CtfConditionId, CacheEntry<MarketRecord>>();

  constructor(deps: OrderMetadataCacheDeps) {
    this.#deps = deps;
  }

  async resolveMarket(tokenId: TokenId): Promise<OrderMarketMetadata> {
    const market = await this.#resolveMarket(tokenId);

    return {
      feeInfo: market.feeInfo,
      negRisk: market.negRisk,
      tickSize: market.tickSize,
    };
  }

  async resolveBuilderTakerFeeRate(
    builderCode: BuilderCode | undefined,
  ): Promise<number> {
    if (builderCode === undefined) {
      return 0;
    }

    return readThrough(
      this.#builderTakerFeeRates,
      builderCode,
      METADATA_TTL_MS,
      () => this.#deps.fetchBuilderTakerFeeRate(builderCode),
    );
  }

  async fetchCurrentMarket(tokenId: TokenId): Promise<OrderMarketMetadata> {
    const conditionId = await readThrough(
      this.#conditions,
      tokenId,
      IMMUTABLE_TTL_MS,
      () => this.#deps.resolveCondition(tokenId),
    );
    const market = await this.#fetchMarket(conditionId);

    this.#assertMarketContainsToken(tokenId, conditionId, market);
    this.#markets.set(conditionId, resolvedEntry(market, METADATA_TTL_MS));

    return {
      feeInfo: market.feeInfo,
      negRisk: market.negRisk,
      tickSize: market.tickSize,
    };
  }

  async #resolveMarket(tokenId: TokenId): Promise<MarketRecord> {
    const conditionId = await readThrough(
      this.#conditions,
      tokenId,
      IMMUTABLE_TTL_MS,
      () => this.#deps.resolveCondition(tokenId),
    );
    const market = await readThrough(
      this.#markets,
      conditionId,
      METADATA_TTL_MS,
      () => this.#fetchMarket(conditionId),
    );

    this.#assertMarketContainsToken(tokenId, conditionId, market);

    return market;
  }

  #assertMarketContainsToken(
    tokenId: TokenId,
    conditionId: CtfConditionId,
    market: MarketRecord,
  ): void {
    if (market.tokenIds.has(tokenId)) {
      return;
    }

    this.#conditions.delete(tokenId);
    this.#markets.delete(conditionId);
    throw new UnexpectedResponseError(
      `Market ${conditionId} does not include token ${tokenId}.`,
    );
  }

  async #fetchMarket(conditionId: CtfConditionId): Promise<MarketRecord> {
    const market = await this.#deps.fetchMarket(conditionId);
    const tokenIds = new Set(market.tokens.map(({ tokenId }) => tokenId));

    for (const tokenId of tokenIds) {
      this.#conditions.set(tokenId, resolvedEntry(conditionId));
    }

    return {
      feeInfo: market.feeInfo,
      negRisk: market.negRisk,
      tickSize: market.tickSize,
      tokenIds,
    };
  }
}

function readThrough<TKey, TValue>(
  entries: Map<TKey, CacheEntry<TValue>>,
  key: TKey,
  ttlMs: number,
  load: () => Promise<TValue>,
): Promise<TValue> {
  const cached = entries.get(key);

  if (
    cached !== undefined &&
    (cached.expiresAt === undefined || cached.expiresAt > Date.now())
  ) {
    return cached.promise;
  }

  const entry: CacheEntry<TValue> = { promise: load() };
  entry.promise.then(
    () => {
      entry.expiresAt = Date.now() + ttlMs;
    },
    () => {
      if (entries.get(key) === entry) {
        entries.delete(key);
      }
    },
  );
  entries.set(key, entry);

  return entry.promise;
}

function resolvedEntry<TValue>(
  value: TValue,
  ttlMs = IMMUTABLE_TTL_MS,
): CacheEntry<TValue> {
  return {
    expiresAt: Date.now() + ttlMs,
    promise: Promise.resolve(value),
  };
}

const cachesByClient = new WeakMap<BaseClient, OrderMetadataCache>();

/** @internal */
export function resolveOrderMarketMetadata(
  client: BaseClient,
  tokenId: TokenId,
): Promise<OrderMarketMetadata> {
  return resolveCache(client).resolveMarket(tokenId);
}

/** @internal */
export function fetchCurrentOrderMarketMetadata(
  client: BaseClient,
  tokenId: TokenId,
): Promise<OrderMarketMetadata> {
  return resolveCache(client).fetchCurrentMarket(tokenId);
}

/** @internal */
export function resolveBuilderTakerFeeRate(
  client: BaseClient,
  builderCode: BuilderCode | undefined,
): Promise<number> {
  return resolveCache(client).resolveBuilderTakerFeeRate(builderCode);
}

function resolveCache(client: BaseClient): OrderMetadataCache {
  const existing = cachesByClient.get(client);

  if (existing !== undefined) {
    return existing;
  }

  const created = new OrderMetadataCache({
    fetchBuilderTakerFeeRate: async (builderCode) =>
      (await fetchBuilderFeeRates(client, { builderCode })).taker,
    fetchMarket: (conditionId) => fetchMarketInfo(client, { conditionId }),
    resolveCondition: (tokenId) => resolveConditionByToken(client, { tokenId }),
  });
  cachesByClient.set(client, created);

  return created;
}
