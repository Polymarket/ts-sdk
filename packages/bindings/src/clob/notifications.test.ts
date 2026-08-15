import { describe, expect, it } from 'vitest';
import {
  NotificationSchema,
  NotificationsResponseSchema,
  NotificationType,
} from './notifications';

const conditionId = `0x${'cc'.repeat(32)}`;
const transactionHash = `0x${'dd'.repeat(32)}`;
const proxyWallet = `0x${'ee'.repeat(20)}`;

const orderPayload = {
  asset_id: '1343197538147866997676250008839231694243646439454152539053',
  condition_id: conditionId,
  eventSlug: 'event-slug',
  icon: 'https://example.com/icon.png',
  image: 'https://example.com/image.png',
  market: conditionId,
  market_slug: 'market-slug',
  matched_size: '10',
  order_id: `0x${'ab'.repeat(32)}`,
  original_size: '100',
  outcome: 'YES',
  outcome_index: 0,
  owner: 'f4f247b7-4ac7-ff29-a152-04fda0a8755a',
  price: '0.6',
  question: 'Will it happen?',
  remaining_size: '90',
  seriesSlug: '',
  side: 'SELL',
  trade_id: 'trade-1',
  transaction_hash: transactionHash,
  type: 'GTC',
};

const marketPayload = {
  accepting_order_timestamp: null,
  accepting_orders: true,
  active: true,
  archived: false,
  closed: false,
  condition_id: conditionId,
  description: 'Resolves YES if it happens.',
  enable_order_book: true,
  end_date_iso: '2026-08-24',
  eventSlug: 'event-slug',
  fpmm: '',
  game_start_time: null,
  icon: 'https://example.com/icon.png',
  image: 'https://example.com/image.png',
  is_50_50_outcome: false,
  maker_base_fee: 0,
  market_slug: 'market-slug',
  minimum_order_size: '15',
  minimum_tick_size: '0.01',
  neg_risk: false,
  neg_risk_market_id: '',
  neg_risk_request_id: '',
  notifications_enabled: true,
  question: 'Will it happen?',
  question_id: `0x${'ab'.repeat(32)}`,
  rewards: {
    max_spread: 3.5,
    min_size: 50,
    rates: [
      {
        asset_address: proxyWallet,
        rewards_daily_rate: 5,
      },
    ],
  },
  seconds_delay: 0,
  tags: ['Sports'],
  taker_base_fee: 0,
  tokens: [
    { outcome: 'Yes', price: 0.6, token_id: '1', winner: false },
    { outcome: 'No', price: 0.4, token_id: '2', winner: true },
  ],
};

const comboAutoRedeemedPayload = {
  amount: 10,
  conditionId: `0x03${'aa'.repeat(30)}`,
  legs: 2,
  outcomeIndex: 0,
  portfolioUrl: 'https://polymarket.com/portfolio',
  positionId: '123456789',
  proxyWallet,
  txnHash: transactionHash,
};

function createNotification(type: number, payload: unknown) {
  return {
    id: type,
    owner: 'f4f247b7-4ac7-ff29-a152-04fda0a8755a',
    payload,
    timestamp: 1675277676000,
    type,
  };
}

describe('NotificationSchema', () => {
  it('parses an order fill notification and normalizes payload field names', () => {
    const notification = NotificationSchema.parse(
      createNotification(NotificationType.ORDER_FILL, orderPayload),
    );

    expect(notification.type).toBe(NotificationType.ORDER_FILL);
    if (notification.type !== NotificationType.ORDER_FILL) {
      return;
    }

    expect(notification.payload.tokenId).toBe(orderPayload.asset_id);
    expect(notification.payload.conditionId).toBe(conditionId);
    expect(notification.payload.orderType).toBe('GTC');
    expect(notification.payload.outcomeIndex).toBe(0);
    expect(notification.payload.transactionHash).toBe(transactionHash);
    expect(notification.payload.matchedSize).toBe('10');
  });

  it('parses an order cancellation with empty transaction fields as undefined', () => {
    const notification = NotificationSchema.parse(
      createNotification(NotificationType.ORDER_CANCELLATION, {
        ...orderPayload,
        trade_id: '',
        transaction_hash: '',
      }),
    );

    expect(notification.type).toBe(NotificationType.ORDER_CANCELLATION);
    if (notification.type !== NotificationType.ORDER_CANCELLATION) {
      return;
    }

    expect(notification.payload.transactionHash).toBeUndefined();
    expect(notification.payload.tradeId).toBeUndefined();
  });

  it('parses a market resolved notification with the market payload', () => {
    const notification = NotificationSchema.parse(
      createNotification(NotificationType.MARKET_RESOLVED, marketPayload),
    );

    expect(notification.type).toBe(NotificationType.MARKET_RESOLVED);
    if (notification.type !== NotificationType.MARKET_RESOLVED) {
      return;
    }

    expect(notification.payload.conditionId).toBe(conditionId);
    expect(notification.payload.endDate).toBe('2026-08-24T00:00:00.000Z');
    expect(notification.payload.tokens[0]?.price).toBe('0.6');
    expect(notification.payload.tokens[1]?.winner).toBe(true);
    expect(notification.payload.rewards?.minSize).toBe('50');
    expect(notification.payload.rewards?.rates?.[0]?.dailyRate).toBe('5');
    expect(notification.payload.minimumTickSize).toBe('0.01');
  });

  it('parses nullable market base fees', () => {
    const notification = NotificationSchema.parse(
      createNotification(NotificationType.MARKET_REGISTERED, {
        ...marketPayload,
        maker_base_fee: null,
        taker_base_fee: null,
      }),
    );

    expect(notification.type).toBe(NotificationType.MARKET_REGISTERED);
    if (notification.type !== NotificationType.MARKET_REGISTERED) {
      return;
    }

    expect(notification.payload.makerBaseFee).toBeNull();
    expect(notification.payload.takerBaseFee).toBeNull();
  });
});

describe('NotificationsResponseSchema', () => {
  it('parses a mixed list covering the remaining notification kinds', () => {
    const notifications = NotificationsResponseSchema.parse([
      createNotification(NotificationType.REWARD_PAYOUT, {
        owner: 'f4f247b7-4ac7-ff29-a152-04fda0a8755a',
        proxyWallet,
        reward: 12.5,
        txnHash: transactionHash,
      }),
      createNotification(NotificationType.CHILD_COMMENT_CREATED, {
        body: 'Nice call!',
        createdAt: '2026-07-01T10:00:00Z',
        eventSlug: 'event-slug',
        eventTitle: 'Event title',
        id: '123',
        image: 'https://example.com/profile.png',
        parentCommentID: '99',
        parentEntityID: 42,
        parentEntityType: 'Event',
        profile: {
          baseAddress: proxyWallet,
          bio: 'Market enthusiast',
          isCreator: false,
          isMod: false,
          name: 'trader',
          positions: [{ positionSize: '25', tokenId: '1' }],
          proxyWallet,
        },
        userAddress: proxyWallet,
      }),
      createNotification(NotificationType.YIELD_PAYOUT, {
        amount: 3.21,
        proxyWallet,
        txnHash: transactionHash,
      }),
      createNotification(NotificationType.ORDER_FILL_FAILED, orderPayload),
      createNotification(NotificationType.AUTO_REDEEMED, {
        amount: 25,
        conditionId,
        image: 'https://example.com/image.png',
        marketUrl: 'https://polymarket.com/market/market-slug',
        negRisk: false,
        portfolioUrl: 'https://polymarket.com/portfolio',
        position: 'Yes',
        proxyWallet,
        question: 'Will it happen?',
        slug: 'market-slug',
        txnHash: transactionHash,
      }),
      createNotification(
        NotificationType.COMBO_AUTO_REDEEMED,
        comboAutoRedeemedPayload,
      ),
    ]);

    expect(notifications.map(({ type }) => type)).toEqual([
      NotificationType.REWARD_PAYOUT,
      NotificationType.CHILD_COMMENT_CREATED,
      NotificationType.YIELD_PAYOUT,
      NotificationType.ORDER_FILL_FAILED,
      NotificationType.AUTO_REDEEMED,
      NotificationType.COMBO_AUTO_REDEEMED,
    ]);

    const [
      rewardPayout,
      childComment,
      yieldPayout,
      ,
      autoRedeemed,
      comboAutoRedeemed,
    ] = notifications;
    if (rewardPayout?.type === NotificationType.REWARD_PAYOUT) {
      expect(rewardPayout.payload.transactionHash).toBe(transactionHash);
      expect(rewardPayout.payload.reward).toBe('12.5');
    }
    if (childComment?.type === NotificationType.CHILD_COMMENT_CREATED) {
      expect(childComment.payload.profile?.wallet).toBe(proxyWallet);
      expect(childComment.payload.profile?.bio).toBe('Market enthusiast');
      expect(childComment.payload.profile?.positions?.[0]?.tokenId).toBe('1');
    }
    if (yieldPayout?.type === NotificationType.YIELD_PAYOUT) {
      expect(yieldPayout.payload.amount).toBe('3.21');
    }
    if (autoRedeemed?.type === NotificationType.AUTO_REDEEMED) {
      expect(autoRedeemed.payload.amount).toBe('25');
    }
    if (comboAutoRedeemed?.type === NotificationType.COMBO_AUTO_REDEEMED) {
      expect(comboAutoRedeemed.payload.amount).toBe('10');
    }
  });

  it('omits unknown notification kinds without discarding known kinds', () => {
    const notifications = NotificationsResponseSchema.parse([
      createNotification(NotificationType.ORDER_FILL, orderPayload),
      createNotification(11, { future: 'payload' }),
      createNotification(NotificationType.YIELD_PAYOUT, {
        amount: 3.21,
        proxyWallet,
        txnHash: transactionHash,
      }),
    ]);

    expect(notifications.map(({ type }) => type)).toEqual([
      NotificationType.ORDER_FILL,
      NotificationType.YIELD_PAYOUT,
    ]);
  });

  it('fails the list when a recognized notification kind is malformed', () => {
    const result = NotificationsResponseSchema.safeParse([
      createNotification(NotificationType.YIELD_PAYOUT, {
        amount: 3.21,
        proxyWallet,
        txnHash: transactionHash,
      }),
      createNotification(NotificationType.ORDER_FILL, {
        ...orderPayload,
        price: 0.6,
      }),
    ]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(({ path }) => path[0] === 1)).toBe(true);
    }
  });

  it('rejects non-object entries and malformed discriminants', () => {
    const result = NotificationsResponseSchema.safeParse([
      null,
      {
        ...createNotification(11, { future: 'payload' }),
        type: '11',
      },
    ]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(({ path }) => path[0] === 0)).toBe(true);
      expect(result.error.issues.some(({ path }) => path[0] === 1)).toBe(true);
    }
  });
});
