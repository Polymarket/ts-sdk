import { z } from 'zod';
import {
  DecimalStringSchema,
  EpochMillisecondsSchema,
  EvmAddressSchema,
} from '../shared';
import {
  PerpsAssetSchema,
  PerpsDataResponseSchema,
  PerpsEntityIdSchema,
  PerpsFundingPaymentIdSchema,
  PerpsInstrumentIdSchema,
} from './common';

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsBalanceSchema = z.object({
  asset: PerpsAssetSchema,
  balance: DecimalStringSchema,
  value: DecimalStringSchema,
});

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsBalance = z.infer<typeof PerpsBalanceSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsBalancesResponseSchema = z.array(PerpsBalanceSchema);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsAccountStatsSchema = z
  .object({
    volume_7d: DecimalStringSchema,
    taker_volume_7d: DecimalStringSchema,
    maker_volume_7d: DecimalStringSchema,
    account_maker_share_7d: DecimalStringSchema,
    entity_maker_share_7d: DecimalStringSchema.optional(),
    entity_id: PerpsEntityIdSchema.optional(),
    entity_name: z.string().min(1).optional(),
  })
  .transform((stats) => ({
    volume7d: stats.volume_7d,
    takerVolume7d: stats.taker_volume_7d,
    makerVolume7d: stats.maker_volume_7d,
    accountMakerShare7d: stats.account_maker_share_7d,
    entityMakerShare7d: stats.entity_maker_share_7d,
    entityId: stats.entity_id,
    entityName: stats.entity_name,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsAccountStats = z.infer<typeof PerpsAccountStatsSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsAccountStatsResponseSchema = PerpsAccountStatsSchema;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsPortfolioPositionSchema = z
  .object({
    instrument_id: PerpsInstrumentIdSchema,
    symbol: z.string().min(1),
    size: DecimalStringSchema,
    entry_price: DecimalStringSchema,
    leverage: z.number().int().positive(),
    cross: z.boolean(),
    initial_margin: DecimalStringSchema,
    maintenance_margin: DecimalStringSchema,
    position_value: DecimalStringSchema,
    liquidation_price: DecimalStringSchema,
    unrealized_pnl: DecimalStringSchema,
    return_on_equity: DecimalStringSchema,
    cumulative_funding: DecimalStringSchema,
  })
  .transform((position) => ({
    instrumentId: position.instrument_id,
    symbol: position.symbol,
    size: position.size,
    entryPrice: position.entry_price,
    leverage: position.leverage,
    cross: position.cross,
    initialMargin: position.initial_margin,
    maintenanceMargin: position.maintenance_margin,
    positionValue: position.position_value,
    liquidationPrice: position.liquidation_price,
    unrealizedPnl: position.unrealized_pnl,
    returnOnEquity: position.return_on_equity,
    cumulativeFunding: position.cumulative_funding,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPortfolioPosition = z.infer<
  typeof PerpsPortfolioPositionSchema
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsMarginSummarySchema = z.object({
  totalAccountValue: DecimalStringSchema,
  totalInitialMargin: DecimalStringSchema,
  totalMaintenanceMargin: DecimalStringSchema,
  totalPositionValue: DecimalStringSchema,
});

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsMarginSummary = z.infer<typeof PerpsMarginSummarySchema>;

const RawPerpsMarginSummarySchema = z
  .object({
    total_account_value: DecimalStringSchema,
    total_initial_margin: DecimalStringSchema,
    total_maintenance_margin: DecimalStringSchema,
    total_position_value: DecimalStringSchema,
  })
  .transform((margin) => ({
    totalAccountValue: margin.total_account_value,
    totalInitialMargin: margin.total_initial_margin,
    totalMaintenanceMargin: margin.total_maintenance_margin,
    totalPositionValue: margin.total_position_value,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsPortfolioSchema = z
  .object({
    positions: z.array(PerpsPortfolioPositionSchema),
    margin: RawPerpsMarginSummarySchema,
    withdrawable: DecimalStringSchema,
    in_liquidation: z.boolean(),
    timestamp: EpochMillisecondsSchema,
  })
  .transform((portfolio) => ({
    positions: portfolio.positions,
    margin: portfolio.margin,
    withdrawable: portfolio.withdrawable,
    inLiquidation: portfolio.in_liquidation,
    timestamp: portfolio.timestamp,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPortfolio = z.infer<typeof PerpsPortfolioSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsPortfolioResponseSchema = PerpsPortfolioSchema;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsAccountFundingPaymentSchema = z
  .object({
    id: PerpsFundingPaymentIdSchema,
    instrument_id: PerpsInstrumentIdSchema,
    size: DecimalStringSchema,
    funding_rate: DecimalStringSchema,
    funding_asset: PerpsAssetSchema,
    funding: DecimalStringSchema,
    timestamp: EpochMillisecondsSchema,
  })
  .transform((funding) => ({
    id: funding.id,
    instrumentId: funding.instrument_id,
    size: funding.size,
    fundingRate: funding.funding_rate,
    fundingAsset: funding.funding_asset,
    funding: funding.funding,
    timestamp: funding.timestamp,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsAccountFundingPayment = z.infer<
  typeof PerpsAccountFundingPaymentSchema
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const ListPerpsFundingPaymentsResponseSchema = PerpsDataResponseSchema(
  PerpsAccountFundingPaymentSchema,
);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsAccountFundingPaymentEntrySchema = z
  .object({
    id: PerpsFundingPaymentIdSchema,
    iid: PerpsInstrumentIdSchema,
    sz: DecimalStringSchema,
    fr: DecimalStringSchema,
    fund: DecimalStringSchema,
    fua: PerpsAssetSchema,
    ts: EpochMillisecondsSchema,
  })
  .transform((funding) => ({
    id: funding.id,
    instrumentId: funding.iid,
    size: funding.sz,
    fundingRate: funding.fr,
    fundingAsset: funding.fua,
    funding: funding.fund,
    timestamp: funding.ts,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsAccountConfigSchema = z
  .object({
    instrument_id: PerpsInstrumentIdSchema,
    leverage: z.number().int().positive(),
    cross: z.boolean(),
  })
  .transform((config) => ({
    instrumentId: config.instrument_id,
    leverage: config.leverage,
    cross: config.cross,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsAccountConfig = z.infer<typeof PerpsAccountConfigSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsAccountConfigResponseSchema = z.array(
  PerpsAccountConfigSchema,
);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsEquityPointSchema = z
  .tuple([EpochMillisecondsSchema, DecimalStringSchema])
  .transform(([timestamp, equity]) => ({ timestamp, equity }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsEquityPoint = z.infer<typeof PerpsEquityPointSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const ListPerpsEquityHistoryResponseSchema = PerpsDataResponseSchema(
  PerpsEquityPointSchema,
);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsPnlPointSchema = z
  .tuple([EpochMillisecondsSchema, DecimalStringSchema])
  .transform(([timestamp, pnl]) => ({ timestamp, pnl }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPnlPoint = z.infer<typeof PerpsPnlPointSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const ListPerpsPnlHistoryResponseSchema =
  PerpsDataResponseSchema(PerpsPnlPointSchema);

const RawPerpsProxyExpirySchema = z
  .number()
  .finite()
  .positive()
  .refine((value) => Number.isInteger(value), 'Expected integer')
  // The credentials endpoint currently returns proxy expiries in nanoseconds.
  .transform((value) =>
    value > Number.MAX_SAFE_INTEGER ? Math.floor(value / 1_000_000) : value,
  )
  .pipe(EpochMillisecondsSchema);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsProxyKeySchema = z
  .object({
    proxy: EvmAddressSchema,
    label: z.string().optional(),
    expiry: RawPerpsProxyExpirySchema,
  })
  .transform((key) => ({
    proxy: key.proxy,
    label: key.label,
    expiresAt: key.expiry,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsProxyKey = z.infer<typeof PerpsProxyKeySchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsCredentialsResponseSchema = z
  .object({
    address: EvmAddressSchema,
    keys: z.array(PerpsProxyKeySchema),
  })
  .transform((credentials) => ({
    address: credentials.address,
    keys: credentials.keys,
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsCreateProxyResponseSchema = z.object({
  secret: z.string().min(1),
});

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsDeleteProxyResponseSchema = z.object({
  status: z.enum(['ok', 'err']),
  error: z.string().optional(),
});
