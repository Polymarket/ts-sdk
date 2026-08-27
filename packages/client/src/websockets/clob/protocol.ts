import type { ApiKeyCreds } from '@polymarket/bindings/clob';
import type {
  MarketEvent,
  UserEvent,
} from '@polymarket/bindings/subscriptions';
import type {
  MarketSubscription,
  UserSubscription,
} from '../../actions/subscriptions';
import type { SubscriptionRegistryEntry } from '../registry';

export type SendWebSocketMessage = (message: unknown) => void;

export type MarketSubscriptionEntry = SubscriptionRegistryEntry<
  MarketSubscription,
  MarketEvent
>;

export type MarketServerSubscription = {
  assetsIds: string[];
  customFeatureEnabled: boolean;
};

export type UserSubscriptionEntry = SubscriptionRegistryEntry<
  UserSubscription,
  UserEvent
>;

export type UserServerSubscription = {
  includeAllMarkets: boolean;
  markets: string[];
};

export function syncMarketSubscription(
  send: SendWebSocketMessage,
  before: MarketServerSubscription,
  after: MarketServerSubscription,
): void {
  const addedAssets = difference(after.assetsIds, before.assetsIds);
  const removedAssets = difference(before.assetsIds, after.assetsIds);

  if (addedAssets.length > 0) {
    send(buildMarketSubscribeUpdate(addedAssets, after.customFeatureEnabled));
  }
  const firstActiveAsset = after.assetsIds[0];
  if (
    addedAssets.length === 0 &&
    before.customFeatureEnabled !== after.customFeatureEnabled &&
    firstActiveAsset !== undefined
  ) {
    // CLOB applies `custom_feature_enabled` before rejecting duplicate assets as
    // "NO NEW ASSETS", so this toggles connection-level custom events in place.
    send(
      buildMarketSubscribeUpdate(
        [firstActiveAsset],
        after.customFeatureEnabled,
      ),
    );
  }
  if (removedAssets.length > 0) {
    send(buildMarketUnsubscribeUpdate(removedAssets));
  }
}

export function syncUserSubscription(
  send: SendWebSocketMessage,
  before: UserServerSubscription,
  after: UserServerSubscription,
): void {
  if (after.includeAllMarkets) {
    if (!before.includeAllMarkets && before.markets.length > 0) {
      send(buildUserUnsubscribeUpdate(before.markets));
    }
    return;
  }

  if (before.includeAllMarkets) {
    if (after.markets.length > 0) {
      send(buildUserSubscribeUpdate(after.markets));
    }
    return;
  }

  const addedMarkets = difference(after.markets, before.markets);
  const removedMarkets = difference(before.markets, after.markets);

  if (addedMarkets.length > 0) {
    send(buildUserSubscribeUpdate(addedMarkets));
  }
  if (removedMarkets.length > 0) {
    send(buildUserUnsubscribeUpdate(removedMarkets));
  }
}

export function deriveMarketServerSubscription(
  entries: Iterable<MarketSubscriptionEntry>,
): MarketServerSubscription {
  const assets = new Set<string>();
  let customFeatureEnabled = false;
  for (const { subscription } of entries) {
    for (const assetId of subscription.assetIds ?? subscription.tokenIds) {
      assets.add(assetId);
    }
    customFeatureEnabled ||= subscription.customFeatureEnabled === true;
  }
  return { assetsIds: Array.from(assets), customFeatureEnabled };
}

export function deriveUserServerSubscription(
  entries: Iterable<UserSubscriptionEntry>,
): UserServerSubscription {
  let includeAllMarkets = false;
  const markets = new Set<string>();
  for (const { subscription } of entries) {
    if (isAllMarketsUserSubscription(subscription)) {
      includeAllMarkets = true;
      continue;
    }
    for (const market of subscription.markets ?? []) markets.add(market);
  }
  return {
    includeAllMarkets,
    markets: includeAllMarkets ? [] : Array.from(markets),
  };
}

export function buildMarketSubscribeMessage(
  subscription: MarketServerSubscription,
): unknown {
  return {
    assets_ids: subscription.assetsIds,
    custom_feature_enabled: subscription.customFeatureEnabled,
    type: 'market',
  };
}

function buildMarketSubscribeUpdate(
  assetsIds: readonly string[],
  customFeatureEnabled: boolean,
): unknown {
  return {
    assets_ids: assetsIds,
    custom_feature_enabled: customFeatureEnabled,
    operation: 'subscribe',
  };
}

function buildMarketUnsubscribeUpdate(assetsIds: readonly string[]): unknown {
  return {
    assets_ids: assetsIds,
    operation: 'unsubscribe',
  };
}

export function buildUserSubscribeMessage(
  subscription: UserServerSubscription,
  credentials: ApiKeyCreds,
): unknown {
  const message: {
    auth: { apiKey: string; passphrase: string; secret: string };
    markets?: string[];
    type: 'user';
  } = {
    auth: {
      apiKey: credentials.key,
      passphrase: credentials.passphrase,
      secret: credentials.secret,
    },
    type: 'user',
  };
  if (!subscription.includeAllMarkets) {
    message.markets = subscription.markets;
  }
  return message;
}

function buildUserSubscribeUpdate(markets: readonly string[]): unknown {
  return {
    markets,
    operation: 'subscribe',
  };
}

function buildUserUnsubscribeUpdate(markets: readonly string[]): unknown {
  return {
    markets,
    operation: 'unsubscribe',
  };
}

export function marketMatcherFor(
  subscription: MarketSubscription,
): (event: MarketEvent) => boolean {
  const assetIds = subscription.assetIds ?? subscription.tokenIds;
  return (event) => {
    switch (event.type) {
      case 'price_change':
        return event.payload.priceChanges.some((change) =>
          assetIds.includes(change.assetId),
        );
      case 'new_market':
        return subscription.customFeatureEnabled === true;
      case 'market_resolved':
        return (
          subscription.customFeatureEnabled === true &&
          (event.payload.assetIds ?? []).some((assetId) =>
            assetIds.includes(assetId),
          )
        );
      case 'best_bid_ask':
        return (
          subscription.customFeatureEnabled === true &&
          assetIds.includes(event.payload.assetId)
        );
      default:
        return assetIds.includes(event.payload.assetId);
    }
  };
}

export function userMatcherFor(
  subscription: UserSubscription,
): (event: UserEvent) => boolean {
  if (isAllMarketsUserSubscription(subscription)) {
    return () => true;
  }

  const markets = new Set(
    (subscription.markets ?? []).map((market) => market.toLowerCase()),
  );
  return (event) => markets.has(event.payload.market.toLowerCase());
}

function isAllMarketsUserSubscription(subscription: UserSubscription): boolean {
  return (subscription.markets?.length ?? 0) === 0;
}

function difference(
  left: readonly string[],
  right: readonly string[],
): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}
