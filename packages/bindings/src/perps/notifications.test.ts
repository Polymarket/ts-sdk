import { describe, expect, it } from 'vitest';
import {
  PerpsNotificationsResyncFrameSchema,
  PerpsSessionUpdateEventSchema,
} from '../subscriptions/perps';
import {
  ListPerpsNotificationsResponseSchema,
  PerpsMarginType,
  PerpsNotificationOrderType,
  PerpsNotificationSchema,
  PerpsNotificationType,
} from './notifications';

const NOTIFICATION_ID = '0a5d8f1e-3b2c-5e4a-9f8b-1c2d3e4f5a6b';
const DELEVERAGED_NOTIFICATION = {
  id: NOTIFICATION_ID,
  type: 'position_deleveraged',
  instrument_id: 1,
  side: 'short',
  size_closed: '0.01234567890123456789',
  price: '52000.125',
  pnl: '130.125',
  margin_type: 'cross',
};

describe('PerpsNotificationSchema', () => {
  it.each([
    'cross',
    'isolated',
  ])('normalizes %s ADL settlements', (marginType) => {
    expect(
      PerpsNotificationSchema.parse({
        ...DELEVERAGED_NOTIFICATION,
        margin_type: marginType,
      }),
    ).toEqual({
      id: NOTIFICATION_ID,
      type: 'position_deleveraged',
      instrumentId: 1,
      side: 'short',
      sizeClosed: '0.01234567890123456789',
      price: '52000.125',
      pnl: '130.125',
      marginType,
    });
  });

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
          notification: DELEVERAGED_NOTIFICATION,
          read_at: null,
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
    expect(response.items).toHaveLength(3);
    expect(response.items[2]).toMatchObject({
      notification: {
        type: 'position_deleveraged',
        price: '52000.125',
        pnl: '130.125',
      },
      readAt: null,
      timestamp: 1_767_225_600_000,
    });
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

  it.each([
    { id: NOTIFICATION_ID, type: 'position_opened' },
    { ...DELEVERAGED_NOTIFICATION, instrument_id: null },
    { ...DELEVERAGED_NOTIFICATION, price: undefined },
    { ...DELEVERAGED_NOTIFICATION, pnl: null },
  ])('fails the page when a recognized notification is malformed', (notification) => {
    expect(
      ListPerpsNotificationsResponseSchema.safeParse({
        items: [
          {
            notification,
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

describe('Perps account event horizons', () => {
  it.each([
    { ch: 'fills', data: [] },
    { ch: 'builderFills', data: [] },
    { ch: 'notifications', data: DELEVERAGED_NOTIFICATION },
    { ch: 'tpsl::1', data: { oid: 1, st: 'armed' } },
  ])('retains event horizons on $ch', (frame) => {
    const wire = {
      ...frame,
      ts: 1_767_225_600_100,
      sq: 42,
      ets: 1_767_225_600_000,
    };
    expect(PerpsSessionUpdateEventSchema.parse(wire)).toMatchObject({
      timestamp: wire.ts,
      eventTimestamp: wire.ets,
      sequence: wire.sq,
    });
    expect(
      PerpsSessionUpdateEventSchema.parse({ ...wire, ets: 0 }).eventTimestamp,
    ).toBe(0);
    const { ets: _horizon, ...missing } = wire;
    expect(PerpsSessionUpdateEventSchema.safeParse(missing).success).toBe(
      false,
    );
  });

  it('preserves the horizon supplied with server notification recovery', () => {
    const wire = {
      ch: 'notifications',
      type: 'resync',
      ts: 1_767_225_600_100,
      ets: 1_767_225_600_000,
      sq: 42,
    };
    expect(PerpsNotificationsResyncFrameSchema.parse(wire)).toMatchObject({
      eventTimestamp: wire.ets,
      timestamp: wire.ts,
    });
    expect(
      PerpsNotificationsResyncFrameSchema.parse({ ...wire, ets: 0 })
        .eventTimestamp,
    ).toBe(0);
    const { ets: _horizon, ...missing } = wire;
    expect(PerpsNotificationsResyncFrameSchema.safeParse(missing).success).toBe(
      false,
    );
  });
});
