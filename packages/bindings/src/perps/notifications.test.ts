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

  it('discriminates liquidation warnings by margin type', () => {
    expect(
      PerpsNotificationSchema.parse({
        id: NOTIFICATION_ID,
        type: 'liquidation_warning',
        margin_type: 'isolated',
        instrument_id: 1,
        mark_price: '100.00',
        liq_price: '2866.27',
      }),
    ).toMatchObject({
      marginType: PerpsMarginType.Isolated,
      instrumentId: 1,
      liquidationPrice: '2866.27',
    });

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
            type: 'position_liquidated',
            instrument_id: 1,
            side: 'long',
            size_closed: '0.05',
            pnl: null,
            margin_type: 'cross',
            via_backstop: true,
          },
          read_at: 1_767_225_700_000,
          ts: 1_767_225_600_000,
        },
        {
          notification: { id: NOTIFICATION_ID, type: 'future_notification' },
          read_at: null,
          ts: 1_767_225_600_000,
        },
      ],
      unread: 3,
      durable_source_seq: 1043,
      has_more: true,
      next_cursor: 'eyJ0cyI6MTc2NzIyNTYwMDAwMCwiaWQiOiIwYTVkOGYxZSJ9',
    });

    // The unknown-type entry is omitted so new notification kinds cannot
    // fail the page read.
    expect(response.items).toHaveLength(2);
    expect(response.items[0]).toMatchObject({
      notification: {
        type: 'position_opened',
        instrumentId: 1,
        orderType: undefined,
      },
      readAt: null,
      timestamp: 1_767_225_600_000,
    });
    expect(response.items[1]).toMatchObject({
      notification: {
        type: 'position_liquidated',
        sizeClosed: '0.05',
        pnl: null,
        viaBackstop: true,
      },
      readAt: 1_767_225_700_000,
    });
    expect(response).toMatchObject({
      unread: 3,
      durable_source_seq: 1043,
      has_more: true,
      next_cursor: 'eyJ0cyI6MTc2NzIyNTYwMDAwMCwiaWQiOiIwYTVkOGYxZSJ9',
    });
  });

  it('fails the page when a recognized notification type is malformed', () => {
    expect(
      ListPerpsNotificationsResponseSchema.safeParse({
        items: [
          {
            // position_opened is recognized, so its missing fields must
            // surface as a validation error rather than a dropped entry.
            notification: { id: NOTIFICATION_ID, type: 'position_opened' },
            read_at: null,
            ts: 1_767_225_600_000,
          },
        ],
        unread: 0,
        durable_source_seq: 0,
        has_more: false,
        next_cursor: null,
      }).success,
    ).toBe(false);
  });
});
