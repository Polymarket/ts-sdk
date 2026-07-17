import { describe, expect, it } from 'vitest';
import {
  ListPerpsNotificationsResponseSchema,
  PerpsMarginType,
  PerpsNotificationOrderType,
  PerpsNotificationSchema,
  PerpsNotificationType,
} from './notifications';

const NOTIFICATION_ID = '0a5d8f1e-3b2c-5e4a-9f8b-1c2d3e4f5a6b';

describe('PerpsNotificationSchema', () => {
  it.each([
    PerpsNotificationType.PositionOpened,
    PerpsNotificationType.PositionIncreased,
    PerpsNotificationType.PositionReduced,
  ])('normalizes %s notifications', (type) => {
    expect(
      PerpsNotificationSchema.parse({
        id: NOTIFICATION_ID,
        type,
        instrument_id: 1,
        side: 'long',
        size: '10.00',
        avg_price: '64210',
        leverage: 10,
        order_type: 'take_profit',
      }),
    ).toEqual({
      id: NOTIFICATION_ID,
      type,
      instrumentId: 1,
      side: 'long',
      size: '10.00',
      avgPrice: '64210',
      leverage: 10,
      orderType: PerpsNotificationOrderType.TakeProfit,
    });
  });

  it('accepts fill-driven notifications without an order type', () => {
    expect(
      PerpsNotificationSchema.parse({
        id: NOTIFICATION_ID,
        type: 'position_opened',
        instrument_id: 1,
        side: 'short',
        size: '10.00',
        avg_price: '64210',
        leverage: 5,
      }),
    ).toMatchObject({
      type: PerpsNotificationType.PositionOpened,
      orderType: undefined,
    });
  });

  it('normalizes position_closed notifications', () => {
    expect(
      PerpsNotificationSchema.parse({
        id: NOTIFICATION_ID,
        type: 'position_closed',
        instrument_id: 1,
        side: 'long',
        size: '10.00',
        avg_price: '64210',
        pnl: '100.00',
        order_type: 'market',
      }),
    ).toEqual({
      id: NOTIFICATION_ID,
      type: PerpsNotificationType.PositionClosed,
      instrumentId: 1,
      side: 'long',
      size: '10.00',
      avgPrice: '64210',
      pnl: '100.00',
      orderType: PerpsNotificationOrderType.Market,
    });
  });

  it('normalizes limit_order_canceled notifications', () => {
    expect(
      PerpsNotificationSchema.parse({
        id: NOTIFICATION_ID,
        type: 'limit_order_canceled',
        instrument_id: 1,
        side: 'long',
        size: '10.00',
        price: '100.00',
      }),
    ).toEqual({
      id: NOTIFICATION_ID,
      type: PerpsNotificationType.LimitOrderCanceled,
      instrumentId: 1,
      side: 'long',
      size: '10.00',
      price: '100.00',
    });
  });

  it('normalizes isolated liquidation warnings', () => {
    expect(
      PerpsNotificationSchema.parse({
        id: NOTIFICATION_ID,
        type: 'liquidation_warning',
        margin_type: 'isolated',
        instrument_id: 1,
        mark_price: '100.00',
        liq_price: '2866.27',
      }),
    ).toEqual({
      id: NOTIFICATION_ID,
      type: PerpsNotificationType.LiquidationWarning,
      marginType: PerpsMarginType.Isolated,
      instrumentId: 1,
      markPrice: '100.00',
      liquidationPrice: '2866.27',
    });
  });

  it('normalizes cross liquidation warnings with a null instrument id', () => {
    expect(
      PerpsNotificationSchema.parse({
        id: NOTIFICATION_ID,
        type: 'liquidation_warning',
        margin_type: 'cross',
        instrument_id: null,
        mark_price: '100.00',
        affected_instruments: [42, 7],
      }),
    ).toEqual({
      id: NOTIFICATION_ID,
      type: PerpsNotificationType.LiquidationWarning,
      marginType: PerpsMarginType.Cross,
      markPrice: '100.00',
      affectedInstruments: [42, 7],
    });
  });

  it('normalizes position_liquidated notifications with a null pnl', () => {
    expect(
      PerpsNotificationSchema.parse({
        id: NOTIFICATION_ID,
        type: 'position_liquidated',
        instrument_id: 1,
        side: 'long',
        size_closed: '0.05',
        pnl: null,
        margin_type: 'cross',
        via_backstop: true,
      }),
    ).toEqual({
      id: NOTIFICATION_ID,
      type: PerpsNotificationType.PositionLiquidated,
      instrumentId: 1,
      side: 'long',
      sizeClosed: '0.05',
      pnl: null,
      marginType: PerpsMarginType.Cross,
      viaBackstop: true,
    });
  });

  it('rejects unknown notification types', () => {
    expect(
      PerpsNotificationSchema.safeParse({
        id: NOTIFICATION_ID,
        type: 'future_notification',
        instrument_id: 1,
      }).success,
    ).toBe(false);
  });
});

describe('ListPerpsNotificationsResponseSchema', () => {
  it('parses the notifications page envelope', () => {
    const response = ListPerpsNotificationsResponseSchema.parse({
      items: [
        {
          notification: {
            id: NOTIFICATION_ID,
            type: 'position_opened',
            instrument_id: 1,
            side: 'long',
            size: '10.00',
            avg_price: '64210',
            leverage: 10,
          },
          read_at: null,
          ts: 1_767_225_600_000,
        },
        {
          notification: {
            id: NOTIFICATION_ID,
            type: 'limit_order_canceled',
            instrument_id: 1,
            side: 'long',
            size: '10.00',
            price: '100.00',
          },
          read_at: 1_767_225_700_000,
          ts: 1_767_225_600_000,
        },
      ],
      unread: 3,
      durable_source_seq: 1043,
      has_more: true,
      next_cursor: 'eyJ0cyI6MTc2NzIyNTYwMDAwMCwiaWQiOiIwYTVkOGYxZSJ9',
    });

    expect(response.items[0]).toMatchObject({
      notification: { type: 'position_opened', instrumentId: 1 },
      readAt: null,
      timestamp: 1_767_225_600_000,
    });
    expect(response.items[1]).toMatchObject({
      readAt: 1_767_225_700_000,
    });
    expect(response.unread).toBe(3);
    expect(response.durable_source_seq).toBe(1043);
    expect(response.has_more).toBe(true);
    expect(response.next_cursor).toBe(
      'eyJ0cyI6MTc2NzIyNTYwMDAwMCwiaWQiOiIwYTVkOGYxZSJ9',
    );
  });
});
