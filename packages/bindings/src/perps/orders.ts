import { z } from 'zod';
import {
  DecimalStringSchema,
  EpochMillisecondsSchema,
  OrderSide,
} from '../shared';
import {
  PerpsAssetSchema,
  PerpsClientOrderIdSchema,
  PerpsDataResponseSchema,
  PerpsInstrumentIdSchema,
  PerpsOrderIdSchema,
  PerpsSideSchema,
  PerpsTimeInForceSchema,
  PerpsTpSlKindSchema,
  PerpsTpSlScopeSchema,
  PerpsTradeIdSchema,
  PerpsTxHashSchema,
} from './common';

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsOrderStatus {
  Accepted = 'accepted',
  Open = 'open',
  Partial = 'partial',
  Filled = 'filled',
  Cancelled = 'cancelled',
  AutoCancelled = 'auto_cancelled',
  PostOnlyRejected = 'post_only_rejected',
  FokUnfilled = 'fok_unfilled',
  IocNoFill = 'ioc_no_fill',
  IocExpired = 'ioc_expired',
  StpCancelled = 'stp_cancelled',
  ZeroQuantity = 'zero_quantity',
  DuplicateOrder = 'duplicate_order',
  OrderNotFound = 'order_not_found',
  ReduceOnlyInvalid = 'reduce_only_invalid',
  ReduceOnlyExpired = 'reduce_only_expired',
  OrderExpired = 'order_expired',
  Untriggered = 'untriggered',
  Armed = 'armed',
  Triggered = 'triggered',
  ParentCancelled = 'parent_cancelled',
  PositionClosed = 'position_closed',
  PositionFlipped = 'position_flipped',
  ReduceOnlyInvalidAtTrigger = 'reduce_only_invalid_at_trigger',
  Expired = 'expired',
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsTpSlOrderFieldsSchema = z
  .object({
    kind: PerpsTpSlKindSchema,
    scope: PerpsTpSlScopeSchema,
    trp: DecimalStringSchema,
    parent_oid: PerpsOrderIdSchema.optional(),
    armed_qty: DecimalStringSchema.optional(),
    slip_bps: z.number().int().nonnegative().optional(),
  })
  .transform((fields) => ({
    kind: fields.kind,
    scope: fields.scope,
    triggerPrice: fields.trp,
    parentOrderId: fields.parent_oid,
    armedQuantity: fields.armed_qty,
    slippageBps: fields.slip_bps,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsTpSlOrderFields = z.infer<typeof PerpsTpSlOrderFieldsSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsOrderStatusSchema = z.enum(PerpsOrderStatus);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsCommandStatusSchema = z.enum(['ok', 'err']);

const PerpsAckErrorSchema = z
  .string()
  .min(1)
  .optional()
  .transform(perpsAckError);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsCommandAckSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok') }),
  z.object({
    status: z.literal('err'),
    error: PerpsAckErrorSchema,
  }),
]);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsCommandAck = z.infer<typeof PerpsCommandAckSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsPostOrderAckSchema = z
  .object({
    status: PerpsCommandStatusSchema,
    oid: PerpsOrderIdSchema.optional(),
    coid: PerpsClientOrderIdSchema.optional(),
    error: z.string().optional(),
  })
  .transform((ack, ctx) => {
    if (ack.status === 'err') {
      return {
        status: 'err' as const,
        error: perpsAckError(ack.error),
        clientOrderId: ack.coid,
      };
    }

    if (ack.oid === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Expected Perps place order acknowledgement order id.',
      });
      return z.NEVER;
    }

    return {
      status: 'ok' as const,
      orderId: ack.oid,
      clientOrderId: ack.coid,
    };
  });

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPostOrderAck = z.infer<typeof PerpsPostOrderAckSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsCancelOrderResultSchema = z
  .object({
    status: PerpsCommandStatusSchema,
    oid: PerpsOrderIdSchema.optional(),
    coid: PerpsClientOrderIdSchema.optional(),
    error: z.string().optional(),
  })
  .transform((ack) => {
    if (ack.status === 'err') {
      return {
        status: 'err' as const,
        error: perpsAckError(ack.error),
        orderId: ack.oid,
        clientOrderId: ack.coid,
      };
    }

    return {
      status: 'ok' as const,
      orderId: ack.oid,
      clientOrderId: ack.coid,
    };
  });

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsCancelOrderResult = z.infer<
  typeof PerpsCancelOrderResultSchema
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsCancelAllOrdersResponseSchema = z.object({
  status: z.literal('ok'),
});

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsCancelAllOrdersResponse = z.infer<
  typeof PerpsCancelAllOrdersResponseSchema
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsUpdateLeverageResultSchema = z
  .object({
    status: z.literal('ok'),
    instrument_id: PerpsInstrumentIdSchema,
    leverage: z.number().int().positive(),
    cross: z.boolean(),
  })
  .transform((result) => ({
    status: result.status,
    instrumentId: result.instrument_id,
    leverage: result.leverage,
    crossMargin: result.cross,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsUpdateLeverageResult = z.infer<
  typeof PerpsUpdateLeverageResultSchema
>;

function perpsAckError(error: string | undefined): string {
  return error ?? 'Perps command was rejected.';
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsOrderSchema = z
  .object({
    order_id: PerpsOrderIdSchema,
    instrument_id: PerpsInstrumentIdSchema,
    buy: z.boolean(),
    price: DecimalStringSchema,
    quantity: DecimalStringSchema,
    tif: PerpsTimeInForceSchema,
    post_only: z.boolean(),
    ro: z.boolean(),
    status: PerpsOrderStatusSchema,
    resting_quantity: DecimalStringSchema,
    filled_quantity: DecimalStringSchema,
    created_timestamp: EpochMillisecondsSchema,
    updated_timestamp: EpochMillisecondsSchema,
    client_order_id: z.string().optional(),
    tpsl: PerpsTpSlOrderFieldsSchema.nullish(),
  })
  .transform((order) => ({
    id: order.order_id,
    instrumentId: order.instrument_id,
    side: order.buy ? OrderSide.BUY : OrderSide.SELL,
    price: order.price,
    quantity: order.quantity,
    timeInForce: order.tif,
    postOnly: order.post_only,
    reduceOnly: order.ro,
    status: order.status,
    restingQuantity: order.resting_quantity,
    filledQuantity: order.filled_quantity,
    createdTimestamp: order.created_timestamp,
    updatedTimestamp: order.updated_timestamp,
    clientOrderId: order.client_order_id,
    tpSl: order.tpsl ?? undefined,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsOrder = z.infer<typeof PerpsOrderSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsOrdersResponseSchema = z.array(PerpsOrderSchema);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsOpenOrdersResponseSchema = z.array(PerpsOrderSchema);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsOrderUpdateSchema = z
  .object({
    oid: PerpsOrderIdSchema,
    iid: PerpsInstrumentIdSchema,
    buy: z.boolean(),
    p: DecimalStringSchema,
    qty: DecimalStringSchema,
    tif: PerpsTimeInForceSchema,
    po: z.boolean(),
    ro: z.boolean(),
    status: PerpsOrderStatusSchema,
    rest: DecimalStringSchema,
    fill: DecimalStringSchema,
    cts: EpochMillisecondsSchema,
    uts: EpochMillisecondsSchema,
    coid: z.string().optional(),
    tpsl: PerpsTpSlOrderFieldsSchema.nullish(),
  })
  .transform((order) => ({
    id: order.oid,
    instrumentId: order.iid,
    side: order.buy ? OrderSide.BUY : OrderSide.SELL,
    price: order.p,
    quantity: order.qty,
    timeInForce: order.tif,
    postOnly: order.po,
    reduceOnly: order.ro,
    status: order.status,
    restingQuantity: order.rest,
    filledQuantity: order.fill,
    createdTimestamp: order.cts,
    updatedTimestamp: order.uts,
    clientOrderId: order.coid,
    tpSl: order.tpsl ?? undefined,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsAccountFillSchema = z
  .object({
    trade_id: PerpsTradeIdSchema,
    order_id: PerpsOrderIdSchema,
    instrument_id: PerpsInstrumentIdSchema,
    side: PerpsSideSchema,
    price: DecimalStringSchema,
    quantity: DecimalStringSchema,
    taker: z.boolean(),
    fee: DecimalStringSchema,
    fee_asset: PerpsAssetSchema,
    previous_size: DecimalStringSchema,
    previous_entry_price: DecimalStringSchema,
    pnl: DecimalStringSchema,
    liquidation: z.boolean(),
    timestamp: EpochMillisecondsSchema,
    hash: PerpsTxHashSchema,
  })
  .transform((fill) => ({
    tradeId: fill.trade_id,
    orderId: fill.order_id,
    instrumentId: fill.instrument_id,
    side: fill.side,
    price: fill.price,
    quantity: fill.quantity,
    taker: fill.taker,
    fee: fill.fee,
    feeAsset: fill.fee_asset,
    previousSize: fill.previous_size,
    previousEntryPrice: fill.previous_entry_price,
    pnl: fill.pnl,
    liquidation: fill.liquidation,
    timestamp: fill.timestamp,
    hash: fill.hash,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsAccountFill = z.infer<typeof PerpsAccountFillSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const ListPerpsFillsResponseSchema = PerpsDataResponseSchema(
  PerpsAccountFillSchema,
);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsAccountFillUpdateSchema = z
  .object({
    tid: PerpsTradeIdSchema,
    oid: PerpsOrderIdSchema,
    iid: PerpsInstrumentIdSchema,
    side: PerpsSideSchema,
    p: DecimalStringSchema,
    qty: DecimalStringSchema,
    taker: z.boolean(),
    fee: DecimalStringSchema,
    fea: PerpsAssetSchema,
    psz: DecimalStringSchema,
    pep: DecimalStringSchema,
    pnl: DecimalStringSchema,
    liq: z.boolean(),
    ts: EpochMillisecondsSchema,
    coid: z.string().optional(),
  })
  .transform((fill) => ({
    tradeId: fill.tid,
    orderId: fill.oid,
    instrumentId: fill.iid,
    side: fill.side,
    price: fill.p,
    quantity: fill.qty,
    taker: fill.taker,
    fee: fill.fee,
    feeAsset: fill.fea,
    previousSize: fill.psz,
    previousEntryPrice: fill.pep,
    pnl: fill.pnl,
    liquidation: fill.liq,
    timestamp: fill.ts,
    clientOrderId: fill.coid,
  }));
