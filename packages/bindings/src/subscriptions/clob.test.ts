import { describe, expect, it } from 'vitest';
import { MarketEventSchema, TradeStatus, UserEventSchema } from './clob';

describe('UserEventSchema', () => {
  it('accepts short trade statuses from the user websocket and normalizes them', () => {
    const result = UserEventSchema.safeParse({
      asset_id: '1',
      event_type: 'trade',
      fee_rate_bps: '0',
      id: 'trade-1',
      last_update: '1710000000',
      maker_address: '0x0000000000000000000000000000000000000001',
      market: 'market-1',
      match_time: '1710000000',
      owner: 'owner-1',
      price: '0.5',
      side: 'BUY',
      size: '1',
      status: 'CONFIRMED',
      taker_order_id: 'order-1',
      timestamp: '1710000000000',
      trade_owner: 'owner-1',
      type: 'TRADE',
    });

    expect(result.success).toBe(true);

    if (!result.success) {
      throw result.error;
    }

    expect(result.data).toMatchObject({
      payload: {
        status: TradeStatus.Confirmed,
      },
      topic: 'user',
      type: 'trade',
    });
  });

  it('still accepts prefixed trade statuses', () => {
    const result = UserEventSchema.safeParse({
      asset_id: '1',
      event_type: 'trade',
      fee_rate_bps: '0',
      id: 'trade-2',
      last_update: '1710000000',
      maker_address: '0x0000000000000000000000000000000000000001',
      market: 'market-1',
      match_time: '1710000000',
      owner: 'owner-1',
      price: '0.5',
      side: 'BUY',
      size: '1',
      status: TradeStatus.Matched,
      taker_order_id: 'order-2',
      timestamp: '1710000000001',
      trade_owner: 'owner-1',
      type: 'TRADE',
    });

    expect(result.success).toBe(true);
  });

  it('normalizes empty-string fee_rate_bps to null on trades and maker orders', () => {
    const result = UserEventSchema.safeParse({
      asset_id: '1',
      event_type: 'trade',
      fee_rate_bps: '',
      id: 'trade-3',
      last_update: '1710000000',
      maker_address: '0x0000000000000000000000000000000000000001',
      maker_orders: [
        {
          asset_id: '1',
          fee_rate_bps: '',
          matched_amount: '10',
          order_id: 'order-4',
          owner: 'owner-2',
          price: '0.5',
          side: 'SELL',
        },
      ],
      market: 'market-1',
      match_time: '1710000000',
      owner: 'owner-1',
      price: '0.5',
      side: 'BUY',
      size: '1',
      status: 'CONFIRMED',
      taker_order_id: 'order-3',
      timestamp: '1710000000002',
      trade_owner: 'owner-1',
      type: 'TRADE',
    });

    expect(result.success).toBe(true);

    if (!result.success) {
      throw result.error;
    }

    expect(result.data).toMatchObject({
      payload: {
        feeRateBps: null,
        makerOrders: [{ feeRateBps: null }],
      },
    });
  });
});

describe('MarketEventSchema', () => {
  it('normalizes empty-string best_bid and best_ask to null on price changes', () => {
    const result = MarketEventSchema.safeParse({
      event_type: 'price_change',
      market: 'market-1',
      price_changes: [
        {
          asset_id: '1',
          best_ask: '',
          best_bid: '',
          hash: 'hash-1',
          price: '0.5',
          side: 'BUY',
          size: '10',
        },
      ],
      timestamp: '1710000000000',
    });

    expect(result.success).toBe(true);

    if (!result.success) {
      throw result.error;
    }

    expect(result.data).toMatchObject({
      payload: {
        priceChanges: [{ bestAsk: null, bestBid: null }],
      },
    });
  });

  it('keeps populated best_bid_ask decimals intact', () => {
    const result = MarketEventSchema.safeParse({
      asset_id: '1',
      best_ask: '0.51',
      best_bid: '0.49',
      event_type: 'best_bid_ask',
      market: 'market-1',
      spread: '',
      timestamp: '1710000000000',
    });

    expect(result.success).toBe(true);

    if (!result.success) {
      throw result.error;
    }

    expect(result.data).toMatchObject({
      payload: {
        bestAsk: '0.51',
        bestBid: '0.49',
        spread: null,
      },
    });
  });
});
