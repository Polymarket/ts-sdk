import type {
  BuilderCode,
  ConditionId,
  TickSizeValue,
} from '@polymarket/bindings';
import type { MarketFeeInfo, MarketInfo } from '@polymarket/bindings/clob';
import type { BaseClient } from '../../clients';
import { UnexpectedResponseError } from '../../errors';
import {
  fetchBuilderFeeRates,
  fetchMarketInfo,
  resolveConditionByToken,
} from '../clob';
import type { OrderAssetId } from './asset';

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
  fetchMarket(conditionId: ConditionId): Promise<MarketInfo>;
  resolveCondition(assetId: OrderAssetId): Promise<ConditionId>;
};

type MarketRecord = OrderMarketMetadata & {
  assetIds: ReadonlySet<OrderAssetId>;
};

type CacheEntry<TValue> = {
  expiresAt?: number;
  promise: Promise<TValue>;
};

/** @internal */
export class OrderMetadataCache {
  readonly #deps: OrderMetadataCacheDeps;
  readonly #builderTakerFeeRates = new Map<BuilderCode, CacheEntry<number>>();
  readonly #conditions = new Map<OrderAssetId, CacheEntry<ConditionId>>();
  readonly #markets = new Map<ConditionId, CacheEntry<MarketRecord>>();

  constructor(deps: OrderMetadataCacheDeps) {
    this.#deps = deps;
  }

  async resolveMarket(assetId: OrderAssetId): Promise<OrderMarketMetadata> {
    const market = await this.#resolveMarket(assetId);

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

  async fetchCurrentMarket(
    assetId: OrderAssetId,
  ): Promise<OrderMarketMetadata> {
    const conditionId = await readThrough(
      this.#conditions,
      assetId,
      IMMUTABLE_TTL_MS,
      () => this.#deps.resolveCondition(assetId),
    );
    const market = await this.#fetchMarket(conditionId);

    this.#assertMarketContainsAsset(assetId, conditionId, market);
    this.#markets.set(conditionId, resolvedEntry(market, METADATA_TTL_MS));

    return {
      feeInfo: market.feeInfo,
      negRisk: market.negRisk,
      tickSize: market.tickSize,
    };
  }

  async #resolveMarket(assetId: OrderAssetId): Promise<MarketRecord> {
    const conditionId = await readThrough(
      this.#conditions,
      assetId,
      IMMUTABLE_TTL_MS,
      () => this.#deps.resolveCondition(assetId),
    );
    const market = await readThrough(
      this.#markets,
      conditionId,
      METADATA_TTL_MS,
      () => this.#fetchMarket(conditionId),
    );

    this.#assertMarketContainsAsset(assetId, conditionId, market);

    return market;
  }

  #assertMarketContainsAsset(
    assetId: OrderAssetId,
    conditionId: ConditionId,
    market: MarketRecord,
  ): void {
    if (market.assetIds.has(assetId)) {
      return;
    }

    this.#conditions.delete(assetId);
    this.#markets.delete(conditionId);
    throw new UnexpectedResponseError(
      `Market ${conditionId} does not include asset ${assetId}.`,
    );
  }

  async #fetchMarket(conditionId: ConditionId): Promise<MarketRecord> {
    const market = await this.#deps.fetchMarket(conditionId);
    const assetIds = new Set(market.tokens.map(({ assetId }) => assetId));

    for (const assetId of assetIds) {
      this.#conditions.set(assetId, resolvedEntry(conditionId));
    }

    return {
      feeInfo: market.feeInfo,
      negRisk: market.negRisk,
      tickSize: market.tickSize,
      assetIds,
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
  assetId: OrderAssetId,
): Promise<OrderMarketMetadata> {
  return resolveCache(client).resolveMarket(assetId);
}

/** @internal */
export function fetchCurrentOrderMarketMetadata(
  client: BaseClient,
  assetId: OrderAssetId,
): Promise<OrderMarketMetadata> {
  return resolveCache(client).fetchCurrentMarket(assetId);
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
    resolveCondition: (assetId) => resolveConditionByToken(client, { assetId }),
  });
  cachesByClient.set(client, created);

  return created;
}
