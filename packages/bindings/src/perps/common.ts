import type { PrivateKey } from '@polymarket/types';
import { z } from 'zod';
import {
  type BaseUnits,
  BaseUnitsSchema,
  DecimalishSchema,
  type DecimalString,
  type EvmAddress,
  type TxHash,
  TxHashSchema,
  toDecimalString,
} from '../shared';

type Tagged<T, Tag extends string> = T & { readonly __tag: Tag };

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsInstrumentId = Tagged<number, 'PerpsInstrumentId'>;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsOrderId = Tagged<number, 'PerpsOrderId'>;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsClientOrderId = Tagged<string, 'PerpsClientOrderId'>;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsNotificationId = Tagged<string, 'PerpsNotificationId'>;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsTradeId = Tagged<number, 'PerpsTradeId'>;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsFundingPaymentId = Tagged<number, 'PerpsFundingPaymentId'>;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsWithdrawalId = Tagged<number, 'PerpsWithdrawalId'>;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsInternalTransferId = Tagged<number, 'PerpsInternalTransferId'>;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsEntityId = Tagged<number, 'PerpsEntityId'>;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsFundingInterval = `${number}h`;

function taggedInteger<T extends number>(value: number): T {
  return value as T;
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsInstrumentIdSchema = z
  .number()
  .int()
  .nonnegative()
  .transform(taggedInteger<PerpsInstrumentId>);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsOrderIdSchema = z
  .number()
  .int()
  .nonnegative()
  .transform(taggedInteger<PerpsOrderId>);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsClientOrderIdSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/)
  .transform((value) => value as PerpsClientOrderId);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsNotificationIdSchema = z
  .uuid()
  .transform((value) => value as PerpsNotificationId);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsTradeIdSchema = z
  .number()
  .int()
  .nonnegative()
  .transform(taggedInteger<PerpsTradeId>);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsFundingPaymentIdSchema = z
  .number()
  .int()
  .nonnegative()
  .transform(taggedInteger<PerpsFundingPaymentId>);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsWithdrawalIdSchema = z
  .number()
  .int()
  .nonnegative()
  .transform(taggedInteger<PerpsWithdrawalId>);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsInternalTransferIdSchema = z
  .number()
  .int()
  .nonnegative()
  .transform(taggedInteger<PerpsInternalTransferId>);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsEntityIdSchema = z
  .number()
  .int()
  .positive()
  .transform(taggedInteger<PerpsEntityId>);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsFundingIntervalSchema = z
  .string()
  .regex(/^[1-9]\d*h$/)
  .transform((value) => value as PerpsFundingInterval);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsDecimalInputSchema = DecimalishSchema;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsDecimalInput = z.input<typeof PerpsDecimalInputSchema>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsInstrumentType {
  Perpetual = 'perpetual',
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsInstrumentCategory {
  Equity = 'equity',
  Commodity = 'commodity',
  Index = 'index',
  Crypto = 'crypto',
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsSide {
  Long = 'long',
  Short = 'short',
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsTimeInForce {
  GTC = 'gtc',
  IOC = 'ioc',
  FOK = 'fok',
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsTpSlKind {
  TakeProfit = 'tp',
  StopLoss = 'sl',
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsTpSlScope {
  Order = 'order',
  Position = 'position',
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsDepositStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Removed = 'removed',
}

/**
 * Known withdrawal statuses.
 *
 * The service evolves this set independently of released clients, so
 * withdrawal parsing accepts unknown statuses as plain strings; see
 * {@link PerpsWithdrawalStatus}.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsKnownWithdrawalStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Removed = 'removed',
  Failed = 'failed',
}

/**
 * A withdrawal status. Known statuses are enumerated in
 * {@link PerpsKnownWithdrawalStatus}; newly introduced statuses flow through
 * as plain strings so they can be handled before a client release that
 * enumerates them.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsWithdrawalStatus = PerpsKnownWithdrawalStatus | (string & {});

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsInternalTransferDirection {
  In = 'in',
  Out = 'out',
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsKlineInterval {
  OneSecond = '1s',
  OneMinute = '1m',
  FiveMinutes = '5m',
  FifteenMinutes = '15m',
  OneHour = '1h',
  FourHours = '4h',
  OneDay = '1d',
  OneWeek = '1w',
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsPnlInterval {
  OneHour = '1h',
  FourHours = '4h',
  OneDay = '1d',
  OneWeek = '1w',
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsSortDirection {
  Descending = 'desc',
  Ascending = 'asc',
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsInstrumentTypeSchema = z.enum(PerpsInstrumentType);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsInstrumentCategorySchema = z.enum(PerpsInstrumentCategory);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsSideSchema = z.enum(PerpsSide);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsTimeInForceSchema = z.enum(PerpsTimeInForce);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsTpSlKindSchema = z.enum(PerpsTpSlKind);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsTpSlScopeSchema = z.enum(PerpsTpSlScope);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsDepositStatusSchema = z.enum(PerpsDepositStatus);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsWithdrawalStatusSchema = z
  .string()
  .transform((value): PerpsWithdrawalStatus => value);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsInternalTransferDirectionSchema = z.enum(
  PerpsInternalTransferDirection,
);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsKlineIntervalSchema = z.enum(PerpsKlineInterval);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsPnlIntervalSchema = z.enum(PerpsPnlInterval);
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsSortDirectionSchema = z.enum(PerpsSortDirection);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsAssetSchema = z.string().min(1);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsTxHashSchema = z.preprocess(
  (hash) => (hash === '0x' || hash === '' ? undefined : hash),
  TxHashSchema.optional(),
);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsDataResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    more: z.boolean(),
  });

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsCredentials = {
  proxy: EvmAddress;
  privateKey: PrivateKey;
  secret: string;
  expiresAt: number;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsDepositAmount = BaseUnits;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsWithdrawalAmount = BaseUnits;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsTxHash = TxHash;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsDecimal = DecimalString;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function perpsDecimal(value: string | number): DecimalString {
  return PerpsDecimalInputSchema.parse(value);
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function perpsBaseUnits(value: string): BaseUnits {
  return BaseUnitsSchema.parse(value);
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function decimalString(value: string): DecimalString {
  return toDecimalString(value);
}
