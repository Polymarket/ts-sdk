import type { Prettify } from '@polymarket/types';
import type {
  BaseClient,
  BasePublicClient,
  BaseSecureClient,
} from '../clients';
import {
  accountActions,
  type PublicAccountActions,
  type SecureAccountActions,
} from './account';
import { type AnalyticsActions, analyticsActions } from './analytics';
import { type DataActions, dataActions } from './data';
import { type DiscoveryActions, discoveryActions } from './discovery';
import {
  fundingActions,
  type PublicFundingActions,
  type SecureFundingActions,
} from './funding';
import {
  type PublicPerpsActions,
  perpsActions,
  type SecurePerpsActions,
} from './perps';
import {
  type PublicRewardsActions,
  rewardsActions,
  type SecureRewardsActions,
} from './rewards';
import { rfqActions, type SecureRfqActions } from './rfq';
import { type SessionKeyActions, sessionKeyActions } from './session-keys';
import {
  type PublicSubscriptionsActions,
  type SecureSubscriptionsActions,
  subscriptionsActions,
} from './subscriptions';
import { type SecureTradingActions, tradingActions } from './trading';
import {
  type PublicWalletActions,
  type SecureWalletActions,
  walletActions,
} from './wallet';

export type PublicActions = Prettify<
  DiscoveryActions &
    DataActions &
    AnalyticsActions &
    PublicFundingActions &
    PublicPerpsActions &
    PublicAccountActions &
    PublicRewardsActions &
    PublicSubscriptionsActions &
    PublicWalletActions
>;

export type SecureActions = Prettify<
  DiscoveryActions &
    DataActions &
    AnalyticsActions &
    SecureFundingActions &
    SecurePerpsActions &
    SecureAccountActions &
    SecureRewardsActions &
    SecureRfqActions &
    SessionKeyActions &
    SecureSubscriptionsActions &
    SecureWalletActions &
    SecureTradingActions
>;

export function allActions(client: BasePublicClient): PublicActions;
export function allActions(client: BaseSecureClient): SecureActions;
export function allActions(client: BaseClient): PublicActions | SecureActions {
  if (client.isSecureClient()) {
    return {
      ...accountActions(client),
      ...analyticsActions(client),
      ...dataActions(client),
      ...discoveryActions(client),
      ...fundingActions(client),
      ...perpsActions(client),
      ...rewardsActions(client),
      ...rfqActions(client),
      ...sessionKeyActions(client),
      ...subscriptionsActions(client),
      ...tradingActions(client),
      ...walletActions(client),
    };
  }

  return {
    ...accountActions(client),
    ...analyticsActions(client),
    ...dataActions(client),
    ...discoveryActions(client),
    ...fundingActions(client),
    ...perpsActions(client),
    ...rewardsActions(client),
    ...subscriptionsActions(client),
    ...walletActions(client),
  };
}

export * from './account';
export * from './analytics';
export * from './data';
export * from './discovery';
export * from './funding';
export * from './perps';
export * from './rewards';
export * from './rfq';
export * from './session-keys';
export * from './subscriptions';
export * from './trading';
export * from './wallet';
