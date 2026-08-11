import {
  type EventForSubscriptionSpecs,
  type PublicSubscriptionSpec,
  type SecureSubscriptionSpec,
  type SubscriptionHandle,
  subscribe,
} from '../actions';
import type {
  BaseClient,
  BasePublicClient,
  BaseSecureClient,
} from '../clients';

export type {
  CryptoPricesChainlinkTwapEvent,
  CryptoPricesChainlinkTwapSixtyEvent,
  CryptoPricesChainlinkTwapSubscription,
  CryptoPricesChainlinkTwapThirtyEvent,
  CryptoPricesChainlinkTwapWindowSeconds,
} from '../actions';
export { SubscribeError } from '../actions';

export type PublicSubscriptionsActions = {
  /**
   * Starts one or more realtime subscriptions on this client.
   *
   * @throws {@link SubscribeError}
   * Thrown when subscription input is invalid or a realtime subscription fails.
   *
   * @example
   * ```ts
   * const handle = await client.subscribe([
   *   { topic: 'market', tokenIds: ['123'] },
   * ]);
   *
   * for await (const event of handle) {
   *   // event: StandardMarketEvent
   * }
   * ```
   */
  subscribe<const TSubscriptions extends readonly PublicSubscriptionSpec[]>(
    subscriptions: TSubscriptions,
  ): Promise<SubscriptionHandle<EventForSubscriptionSpecs<TSubscriptions>>>;
};

export type SecureSubscriptionsActions = {
  /**
   * Starts one or more realtime subscriptions on this client.
   *
   * @throws {@link SubscribeError}
   * Thrown when subscription input is invalid or a realtime subscription fails.
   *
   * @example
   * ```ts
   * const handle = await client.subscribe([
   *   { topic: 'user' },
   *   { topic: 'market', tokenIds: ['123'] },
   * ]);
   *
   * for await (const event of handle) {
   *   // event: StandardMarketEvent | UserEvent
   * }
   * ```
   */
  subscribe<const TSubscriptions extends readonly SecureSubscriptionSpec[]>(
    subscriptions: TSubscriptions,
  ): Promise<SubscriptionHandle<EventForSubscriptionSpecs<TSubscriptions>>>;
};

export function subscriptionsActions(
  client: BasePublicClient,
): PublicSubscriptionsActions;
export function subscriptionsActions(
  client: BaseSecureClient,
): SecureSubscriptionsActions;
export function subscriptionsActions(
  client: BaseClient,
): PublicSubscriptionsActions | SecureSubscriptionsActions {
  // Wrap instead of `bind` so the method preserves its generic type parameter
  // and can narrow the resolved event type per call site.
  if (client.isSecureClient()) {
    return {
      subscribe<const TSubscriptions extends readonly SecureSubscriptionSpec[]>(
        subscriptions: TSubscriptions,
      ): Promise<
        SubscriptionHandle<EventForSubscriptionSpecs<TSubscriptions>>
      > {
        return subscribe(client, subscriptions);
      },
    };
  }

  return {
    subscribe<const TSubscriptions extends readonly PublicSubscriptionSpec[]>(
      subscriptions: TSubscriptions,
    ): Promise<SubscriptionHandle<EventForSubscriptionSpecs<TSubscriptions>>> {
      return subscribe(client, subscriptions);
    },
  };
}
