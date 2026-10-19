import {
  type DecimalString,
  type IsoCalendarDateString,
  type OrderSide,
  type PositionId,
  type TokenId,
  toPositionId,
  toTokenId,
} from '@polymarket/bindings';
import type {
  LastTradePrice,
  Midpoints,
  NotificationsResponse,
  Prices,
  Spreads,
  TotalUserEarning,
} from '@polymarket/bindings/clob';
import { describe, expectTypeOf, it } from 'vitest';
import type { SecureClient } from '../clients';
import type { DataActions } from '../decorators';
import { NotificationType } from '../index';
import type {
  FetchOrderBookRequest,
  fetchLastTradePrice,
  fetchMidpoint,
  fetchMidpoints,
  fetchPrice,
  fetchPrices,
  fetchSpread,
  fetchSpreads,
} from './index';

describe('public CLOB price read types', () => {
  it('accepts assetId and the tokenId compatibility input', () => {
    const assetRequest: FetchOrderBookRequest = { assetId: toTokenId('123') };
    const positionRequest: FetchOrderBookRequest = {
      assetId: toPositionId('456'),
    };
    const tokenRequest: FetchOrderBookRequest = { tokenId: '123' };
    const rawAssetRequest: FetchOrderBookRequest = { assetId: '123' };
    // @ts-expect-error Provide exactly one exchange asset identifier.
    const both: FetchOrderBookRequest = {
      assetId: toTokenId('123'),
      tokenId: '123',
    };
    // @ts-expect-error An exchange asset identifier is required.
    const neither: FetchOrderBookRequest = {};

    expectTypeOf(assetRequest).toMatchTypeOf<FetchOrderBookRequest>();
    expectTypeOf(positionRequest).toMatchTypeOf<FetchOrderBookRequest>();
    expectTypeOf(tokenRequest).toMatchTypeOf<FetchOrderBookRequest>();
    expectTypeOf(rawAssetRequest).toMatchTypeOf<FetchOrderBookRequest>();
    void both;
    void neither;
  });

  it('models batch price reads as asset ID keyed decimal records', () => {
    expectTypeOf<Midpoints>().toEqualTypeOf<
      Record<TokenId | PositionId, DecimalString>
    >();
    expectTypeOf<Prices>().toEqualTypeOf<
      Record<TokenId | PositionId, Partial<Record<OrderSide, DecimalString>>>
    >();
    expectTypeOf<Spreads>().toEqualTypeOf<
      Record<TokenId | PositionId, DecimalString>
    >();
  });

  it('preserves branded decimal action return types', () => {
    expectTypeOf<ReturnType<typeof fetchMidpoint>>().toEqualTypeOf<
      Promise<DecimalString>
    >();
    expectTypeOf<ReturnType<typeof fetchMidpoints>>().toEqualTypeOf<
      Promise<Midpoints>
    >();
    expectTypeOf<ReturnType<typeof fetchPrice>>().toEqualTypeOf<
      Promise<DecimalString>
    >();
    expectTypeOf<ReturnType<typeof fetchSpread>>().toEqualTypeOf<
      Promise<DecimalString>
    >();
    expectTypeOf<ReturnType<typeof fetchSpreads>>().toEqualTypeOf<
      Promise<Spreads>
    >();
  });

  it('preserves branded decimal decorator return types', () => {
    const actions = {} as DataActions;

    expectTypeOf<ReturnType<typeof actions.fetchMidpoint>>().toEqualTypeOf<
      Promise<DecimalString>
    >();
    expectTypeOf<ReturnType<typeof actions.fetchMidpoints>>().toEqualTypeOf<
      Promise<Midpoints>
    >();
    expectTypeOf<ReturnType<typeof actions.fetchPrice>>().toEqualTypeOf<
      Promise<DecimalString>
    >();
    expectTypeOf<ReturnType<typeof actions.fetchSpread>>().toEqualTypeOf<
      Promise<DecimalString>
    >();
    expectTypeOf<ReturnType<typeof actions.fetchSpreads>>().toEqualTypeOf<
      Promise<Spreads>
    >();
  });

  it('preserves fetchPrices return type on actions and decorators', () => {
    const actions = {} as DataActions;

    expectTypeOf<ReturnType<typeof fetchPrices>>().toEqualTypeOf<
      Promise<Prices>
    >();
    expectTypeOf<ReturnType<typeof actions.fetchPrices>>().toEqualTypeOf<
      Promise<Prices>
    >();
  });

  it('models last trade absence in action and decorator return types', () => {
    const actions = {} as DataActions;

    expectTypeOf<LastTradePrice>().toMatchTypeOf<{
      price: DecimalString;
      side: OrderSide;
    }>();
    expectTypeOf<Extract<LastTradePrice, null>>().toEqualTypeOf<never>();
    expectTypeOf<ReturnType<typeof fetchLastTradePrice>>().toEqualTypeOf<
      Promise<LastTradePrice | null>
    >();
    expectTypeOf<
      ReturnType<typeof actions.fetchLastTradePrice>
    >().toEqualTypeOf<Promise<LastTradePrice | null>>();
  });
});

describe('order heartbeat public types', () => {
  it('exposes authenticated heartbeat actions and recovery data', () => {
    const request: import('../index').SendOrderHeartbeatRequest = {
      heartbeatId: '',
    };
    expectTypeOf(request).toMatchTypeOf<
      import('./index').SendOrderHeartbeatRequest
    >();
    expectTypeOf<
      ReturnType<typeof import('./index').sendOrderHeartbeat>
    >().toEqualTypeOf<Promise<import('../index').OrderHeartbeat>>();
    expectTypeOf<import('../index').SecureClient>().not.toHaveProperty(
      'sendLegacyOrderHeartbeat',
    );
    expectTypeOf<typeof import('./index')>().not.toHaveProperty(
      'sendLegacyOrderHeartbeat',
    );
    expectTypeOf<typeof import('../index')>().not.toHaveProperty(
      'SendLegacyOrderHeartbeatError',
    );
    expectTypeOf<
      typeof import('@polymarket/bindings/clob')
    >().not.toHaveProperty('LegacyOrderHeartbeatSchema');
    expectTypeOf<import('../index').PublicClient>().not.toHaveProperty(
      'sendOrderHeartbeat',
    );
    expectTypeOf<import('../index').SecureClient>().toHaveProperty(
      'sendOrderHeartbeat',
    );
    expectTypeOf<import('../index').SecureClient>()
      .toHaveProperty('sendOrderHeartbeat')
      .returns.toEqualTypeOf<Promise<import('../index').OrderHeartbeat>>();
    expectTypeOf<import('../index').OrderHeartbeatMismatchError>()
      .toHaveProperty('name')
      .toEqualTypeOf<'OrderHeartbeatMismatchError'>();
    expectTypeOf<
      import('../index').OrderHeartbeatMismatchError
    >().toMatchTypeOf<import('../index').RequestRejectedError>();
  });
});

describe('reward market discovery public types', () => {
  it('exposes supported discovery filters on the public client', () => {
    expectTypeOf<import('../index').PublicClient>()
      .toHaveProperty('listRewardMarkets')
      .parameter(1)
      .toEqualTypeOf<import('../index').RequestOptions | undefined>();
    expectTypeOf<import('../index').PublicClient>()
      .toHaveProperty('listRewardMarkets')
      .parameter(0)
      .toEqualTypeOf<import('../index').ListRewardMarketsRequest | undefined>();
    expectTypeOf<
      import('../index').ListRewardMarketsRequest
    >().not.toHaveProperty('excludeTagSlugs');
  });
  it('exposes normalized pagination and the discovery request at the root', () => {
    const request: import('../index').ListRewardMarketsRequest = {
      query: 'sports',
      eventIds: [1, 2],
      marketId: 12,
      pageSize: 25,
      minVolume24hr: 1,
      maxVolume24hr: 10,
    };
    expectTypeOf(request).toMatchTypeOf<
      import('./index').ListRewardMarketsRequest
    >();
    expectTypeOf<
      ReturnType<typeof import('./index').listRewardMarkets>
    >().toEqualTypeOf<
      import('../index').Paginated<import('../index').RewardMarket[]>
    >();
  });
});

declare const notificationsClient: SecureClient;
describe('notifications public client types', () => {
  it('narrows tier upgrade payloads through the bound method', async () => {
    const notifications = notificationsClient.fetchNotifications();
    expectTypeOf(notifications).toEqualTypeOf<Promise<NotificationsResponse>>();
    for (const notification of await notifications) {
      if (notification.type === NotificationType.TAKER_TIER_UPGRADED) {
        expectTypeOf(notification.payload.previousTier).toEqualTypeOf<number>();
        expectTypeOf(notification.payload.tier).toEqualTypeOf<number>();
        expectTypeOf(notification.payload.rebateBps).toEqualTypeOf<number>();
        expectTypeOf(
          notification.payload.snapshotDate,
        ).toEqualTypeOf<IsoCalendarDateString>();
      }
    }
  });
});

declare const earningsClient: SecureClient;
describe('total earnings public client types', () => {
  it('accepts the sponsored option and returns decimal breakdowns', async () => {
    const earnings = earningsClient.fetchTotalEarningsForUserForDay({
      date: '2026-10-06',
      sponsored: true,
    });
    expectTypeOf(earnings).toEqualTypeOf<Promise<TotalUserEarning[]>>();
    for (const earning of await earnings) {
      expectTypeOf(earning.nativeEarnings).toEqualTypeOf<
        DecimalString | undefined
      >();
      expectTypeOf(earning.sponsoredEarnings).toEqualTypeOf<
        DecimalString | undefined
      >();
    }
  });
});
