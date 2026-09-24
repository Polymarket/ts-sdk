import { z } from 'zod';
import {
  DecimalStringSchema,
  EpochMillisecondsSchema,
  EvmAddressSchema,
  OrderSide,
} from '../shared';
import {
  PerpsAssetSchema,
  PerpsBuilderEarningIdSchema,
  PerpsClientOrderIdSchema,
  PerpsInstrumentIdSchema,
  PerpsOrderIdSchema,
  PerpsTradeIdSchema,
} from './common';

const BuilderDecimalSchema = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?$/)
  .pipe(DecimalStringSchema);
const NonnegativeIntegerSchema = z.number().int().nonnegative();

/**
 * Saved attribution and the decimal fraction charged on executed notional.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsBuilderTermsSchema = z
  .object({
    address: EvmAddressSchema,
    fee_rate: BuilderDecimalSchema,
  })
  .transform((terms) => ({ address: terms.address, feeRate: terms.fee_rate }));

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsBuilderTerms = z.infer<typeof PerpsBuilderTermsSchema>;

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsBuilderStatusSchema = z
  .object({
    address: EvmAddressSchema,
    registered: z.boolean(),
    enabled: z.boolean(),
    admission_enabled: z.boolean(),
    max_fee_rate: BuilderDecimalSchema,
  })
  .transform((status) => ({
    address: status.address,
    registered: status.registered,
    enabled: status.enabled,
    admissionEnabled: status.admission_enabled,
    maxFeeRate: status.max_fee_rate,
  }));

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsBuilderStatus = z.infer<typeof PerpsBuilderStatusSchema>;

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsBuilderApprovalSchema = z
  .object({
    trader: EvmAddressSchema,
    builder: EvmAddressSchema,
    max_fee_rate: BuilderDecimalSchema,
    approval_version: z.number().int().positive(),
    timestamp: EpochMillisecondsSchema,
    sequence: NonnegativeIntegerSchema,
  })
  .transform((approval) => ({
    trader: approval.trader,
    builder: approval.builder,
    maxFeeRate: approval.max_fee_rate,
    approvalVersion: approval.approval_version,
    timestamp: approval.timestamp,
    sequence: approval.sequence,
  }));

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsBuilderApproval = z.infer<typeof PerpsBuilderApprovalSchema>;

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const FetchPerpsBuilderApprovalsResponseSchema = z.object({
  data: z.array(PerpsBuilderApprovalSchema),
});

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export enum PerpsLiquidityRole {
  Maker = 'maker',
  Taker = 'taker',
}

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsBuilderEarningSchema = z
  .object({
    earning_id: PerpsBuilderEarningIdSchema,
    trade_id: PerpsTradeIdSchema,
    order_id: PerpsOrderIdSchema,
    instrument_id: PerpsInstrumentIdSchema,
    trader: EvmAddressSchema,
    buy: z.boolean(),
    price: BuilderDecimalSchema,
    quantity: BuilderDecimalSchema,
    client_order_id: PerpsClientOrderIdSchema.optional(),
    side: z.enum(PerpsLiquidityRole),
    timestamp: EpochMillisecondsSchema,
    sequence: NonnegativeIntegerSchema,
    notional: BuilderDecimalSchema,
    fee_asset: PerpsAssetSchema,
    fee: BuilderDecimalSchema,
    builder_fee: BuilderDecimalSchema,
    total_fee: BuilderDecimalSchema,
    fee_rate: BuilderDecimalSchema,
  })
  .transform((earning) => ({
    earningId: earning.earning_id,
    tradeId: earning.trade_id,
    orderId: earning.order_id,
    instrumentId: earning.instrument_id,
    trader: earning.trader,
    side: earning.buy ? OrderSide.BUY : OrderSide.SELL,
    price: earning.price,
    quantity: earning.quantity,
    ...(earning.client_order_id === undefined
      ? {}
      : { clientOrderId: earning.client_order_id }),
    liquidityRole: earning.side,
    timestamp: earning.timestamp,
    sequence: earning.sequence,
    notional: earning.notional,
    feeAsset: earning.fee_asset,
    /** Exchange fee for the fill, excluding the builder fee. */
    fee: earning.fee,
    /** Builder fee charged in addition to `fee` and credited to this builder. */
    builderFee: earning.builder_fee,
    /** Sum of `fee` and `builderFee`. */
    totalFee: earning.total_fee,
    /** Builder fee rate for the fill, as a decimal fraction of `notional`. */
    feeRate: earning.fee_rate,
  }));

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsBuilderEarning = z.infer<typeof PerpsBuilderEarningSchema>;

const BuilderEarningsWindowSchema = z.object({
  start_timestamp: EpochMillisecondsSchema,
  end_timestamp: EpochMillisecondsSchema,
  as_of_sequence: NonnegativeIntegerSchema,
});

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsBuilderEarningsSnapshotSchema =
  BuilderEarningsWindowSchema.transform((window) => ({
    start: window.start_timestamp,
    end: window.end_timestamp,
    asOfSequence: window.as_of_sequence,
  }));

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsBuilderEarningsSnapshot = z.infer<
  typeof PerpsBuilderEarningsSnapshotSchema
>;

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const ListPerpsBuilderEarningsResponseSchema =
  BuilderEarningsWindowSchema.extend({
    data: z.array(PerpsBuilderEarningSchema),
    more: z.boolean(),
    cursor: z.string().min(1).optional(),
  }).transform((page) => ({
    data: page.data,
    more: page.more,
    ...(page.cursor === undefined ? {} : { cursor: page.cursor }),
    snapshot: {
      start: page.start_timestamp,
      end: page.end_timestamp,
      asOfSequence: page.as_of_sequence,
    },
  }));

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsBuilderEarningsAssetSchema = z
  .object({
    fee_asset: PerpsAssetSchema,
    fill_count: NonnegativeIntegerSchema,
    notional: BuilderDecimalSchema,
    builder_fee: BuilderDecimalSchema,
  })
  .transform((asset) => ({
    feeAsset: asset.fee_asset,
    fillCount: asset.fill_count,
    notional: asset.notional,
    builderFee: asset.builder_fee,
  }));

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsBuilderEarningsAsset = z.infer<
  typeof PerpsBuilderEarningsAssetSchema
>;

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsBuilderEarningsSummarySchema =
  BuilderEarningsWindowSchema.extend({
    data: z.array(PerpsBuilderEarningsAssetSchema),
    trader_count: NonnegativeIntegerSchema,
    active_approval_count: NonnegativeIntegerSchema,
  }).transform((summary) => ({
    assets: summary.data,
    traderCount: summary.trader_count,
    activeApprovalCount: summary.active_approval_count,
    snapshot: {
      start: summary.start_timestamp,
      end: summary.end_timestamp,
      asOfSequence: summary.as_of_sequence,
    },
  }));

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsBuilderEarningsSummary = z.infer<
  typeof PerpsBuilderEarningsSummarySchema
>;
