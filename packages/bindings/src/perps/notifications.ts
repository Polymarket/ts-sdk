import { z } from 'zod';
import { DecimalStringSchema, EpochMillisecondsSchema } from '../shared';
import {
  PerpsInstrumentIdSchema,
  PerpsNotificationIdSchema,
  PerpsSideSchema,
} from './common';

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsNotificationType {
  PositionOpened = 'position_opened',
  PositionIncreased = 'position_increased',
  PositionReduced = 'position_reduced',
  PositionClosed = 'position_closed',
  LimitOrderCanceled = 'limit_order_canceled',
  LiquidationWarning = 'liquidation_warning',
  PositionLiquidated = 'position_liquidated',
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsNotificationTypeSchema = z.enum(PerpsNotificationType);

/**
 * Kind of order whose execution produced a fill-driven position notification.
 * A TP/SL-triggered order reports the trigger that fired it whether it
 * aggressed or rested; otherwise an aggressor submitted without a limit price
 * is `market` and everything else, including a maker's resting order, is
 * `limit`.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsNotificationOrderType {
  Market = 'market',
  Limit = 'limit',
  TakeProfit = 'take_profit',
  StopLoss = 'stop_loss',
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsNotificationOrderTypeSchema = z.enum(
  PerpsNotificationOrderType,
);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsMarginType {
  Cross = 'cross',
  Isolated = 'isolated',
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsMarginTypeSchema = z.enum(PerpsMarginType);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsPositionChangeNotificationSchema = z
  .object({
    id: PerpsNotificationIdSchema,
    type: z.enum([
      PerpsNotificationType.PositionOpened,
      PerpsNotificationType.PositionIncreased,
      PerpsNotificationType.PositionReduced,
    ]),
    instrument_id: PerpsInstrumentIdSchema,
    side: PerpsSideSchema,
    size: DecimalStringSchema,
    avg_price: DecimalStringSchema,
    leverage: z.number().int().positive(),
    order_type: PerpsNotificationOrderTypeSchema.optional(),
  })
  .transform((notification) => ({
    id: notification.id,
    type: notification.type,
    instrumentId: notification.instrument_id,
    side: notification.side,
    size: notification.size,
    avgPrice: notification.avg_price,
    leverage: notification.leverage,
    orderType: notification.order_type,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPositionChangeNotification = z.infer<
  typeof PerpsPositionChangeNotificationSchema
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsPositionClosedNotificationSchema = z
  .object({
    id: PerpsNotificationIdSchema,
    type: z.literal(PerpsNotificationType.PositionClosed),
    instrument_id: PerpsInstrumentIdSchema,
    side: PerpsSideSchema,
    size: DecimalStringSchema,
    avg_price: DecimalStringSchema,
    pnl: DecimalStringSchema,
    order_type: PerpsNotificationOrderTypeSchema.optional(),
  })
  .transform((notification) => ({
    id: notification.id,
    type: notification.type,
    instrumentId: notification.instrument_id,
    side: notification.side,
    size: notification.size,
    avgPrice: notification.avg_price,
    pnl: notification.pnl,
    orderType: notification.order_type,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPositionClosedNotification = z.infer<
  typeof PerpsPositionClosedNotificationSchema
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsLimitOrderCanceledNotificationSchema = z
  .object({
    id: PerpsNotificationIdSchema,
    type: z.literal(PerpsNotificationType.LimitOrderCanceled),
    instrument_id: PerpsInstrumentIdSchema,
    side: PerpsSideSchema,
    size: DecimalStringSchema,
    price: DecimalStringSchema,
  })
  .transform((notification) => ({
    id: notification.id,
    type: notification.type,
    instrumentId: notification.instrument_id,
    side: notification.side,
    size: notification.size,
    price: notification.price,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsLimitOrderCanceledNotification = z.infer<
  typeof PerpsLimitOrderCanceledNotificationSchema
>;

const PerpsIsolatedLiquidationWarningNotificationSchema = z
  .object({
    id: PerpsNotificationIdSchema,
    type: z.literal(PerpsNotificationType.LiquidationWarning),
    margin_type: z.literal(PerpsMarginType.Isolated),
    instrument_id: PerpsInstrumentIdSchema,
    mark_price: DecimalStringSchema,
    liq_price: DecimalStringSchema,
  })
  .transform((notification) => ({
    id: notification.id,
    type: notification.type,
    marginType: notification.margin_type,
    instrumentId: notification.instrument_id,
    markPrice: notification.mark_price,
    liquidationPrice: notification.liq_price,
  }));

const PerpsCrossLiquidationWarningNotificationSchema = z
  .object({
    id: PerpsNotificationIdSchema,
    type: z.literal(PerpsNotificationType.LiquidationWarning),
    margin_type: z.literal(PerpsMarginType.Cross),
    instrument_id: z.null(),
    mark_price: DecimalStringSchema,
    affected_instruments: z.array(PerpsInstrumentIdSchema),
  })
  .transform((notification) => ({
    id: notification.id,
    type: notification.type,
    marginType: notification.margin_type,
    markPrice: notification.mark_price,
    affectedInstruments: notification.affected_instruments,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsLiquidationWarningNotificationSchema = z.discriminatedUnion(
  'margin_type',
  [
    PerpsIsolatedLiquidationWarningNotificationSchema,
    PerpsCrossLiquidationWarningNotificationSchema,
  ],
);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsLiquidationWarningNotification = z.infer<
  typeof PerpsLiquidationWarningNotificationSchema
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsPositionLiquidatedNotificationSchema = z
  .object({
    id: PerpsNotificationIdSchema,
    type: z.literal(PerpsNotificationType.PositionLiquidated),
    instrument_id: PerpsInstrumentIdSchema,
    side: PerpsSideSchema,
    size_closed: DecimalStringSchema,
    pnl: DecimalStringSchema.nullable(),
    margin_type: PerpsMarginTypeSchema,
    via_backstop: z.boolean(),
  })
  .transform((notification) => ({
    id: notification.id,
    type: notification.type,
    instrumentId: notification.instrument_id,
    side: notification.side,
    sizeClosed: notification.size_closed,
    pnl: notification.pnl,
    marginType: notification.margin_type,
    viaBackstop: notification.via_backstop,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPositionLiquidatedNotification = z.infer<
  typeof PerpsPositionLiquidatedNotificationSchema
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsNotificationSchema = z.discriminatedUnion('type', [
  PerpsPositionChangeNotificationSchema,
  PerpsPositionClosedNotificationSchema,
  PerpsLimitOrderCanceledNotificationSchema,
  PerpsLiquidationWarningNotificationSchema,
  PerpsPositionLiquidatedNotificationSchema,
]);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsNotification = z.infer<typeof PerpsNotificationSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsNotificationEntrySchema = z
  .object({
    notification: PerpsNotificationSchema,
    read_at: EpochMillisecondsSchema.nullable(),
    ts: EpochMillisecondsSchema,
  })
  .transform((entry) => ({
    notification: entry.notification,
    readAt: entry.read_at,
    timestamp: entry.ts,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsNotificationEntry = z.infer<
  typeof PerpsNotificationEntrySchema
>;

// Probes only the discriminator so list entries carrying notification types
// unknown to this SDK version can be skipped without failing the page read.
const PerpsNotificationEntryTypeProbeSchema = z.object({
  notification: z.object({ type: PerpsNotificationTypeSchema }),
});

const PerpsNotificationEntriesSchema = z
  .array(z.unknown())
  .transform((items, ctx) => {
    const entries: PerpsNotificationEntry[] = [];
    items.forEach((item, index) => {
      if (!PerpsNotificationEntryTypeProbeSchema.safeParse(item).success) {
        return;
      }
      const entry = PerpsNotificationEntrySchema.safeParse(item);
      if (entry.success) {
        entries.push(entry.data);
        return;
      }
      for (const issue of entry.error.issues) {
        ctx.addIssue({ ...issue, path: [index, ...issue.path] });
      }
    });
    return entries;
  });

/**
 * Entries with notification types unknown to this SDK version are omitted
 * from `items` so newly introduced notification kinds cannot fail the read;
 * recognized types still validate strictly.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const ListPerpsNotificationsResponseSchema = z.object({
  items: PerpsNotificationEntriesSchema,
  unread: z.number().int().nonnegative(),
  durable_source_seq: z.number().int().nonnegative(),
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
});

/**
 * Projection of the notifications list response for unread-count reads.
 * Deliberately leaves `items` unvalidated so notification shapes unknown to
 * this SDK version cannot fail a read that only needs the counter.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsUnreadNotificationsCountResponseSchema = z.object({
  unread: z.number().int().nonnegative(),
});

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const MarkPerpsNotificationsReadResponseSchema = z.object({
  status: z.enum(['ok', 'err']),
  error: z.string().optional(),
});
