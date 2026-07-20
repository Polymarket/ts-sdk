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

export type PerpsInstrumentId = Tagged<number, 'PerpsInstrumentId'>;
export type PerpsOrderId = Tagged<number, 'PerpsOrderId'>;
export type PerpsClientOrderId = Tagged<string, 'PerpsClientOrderId'>;
export type PerpsTradeId = Tagged<number, 'PerpsTradeId'>;
export type PerpsWithdrawalId = Tagged<number, 'PerpsWithdrawalId'>;
export type PerpsInternalTransferId = Tagged<number, 'PerpsInternalTransferId'>;
export type PerpsEntityId = Tagged<number, 'PerpsEntityId'>;
export type PerpsFundingInterval = `${number}h`;

function taggedInteger<T extends number>(value: number): T {
  return value as T;
}

export const PerpsInstrumentIdSchema = z
  .number()
  .int()
  .nonnegative()
  .transform(taggedInteger<PerpsInstrumentId>);

export const PerpsOrderIdSchema = z
  .number()
  .int()
  .nonnegative()
  .transform(taggedInteger<PerpsOrderId>);

export const PerpsClientOrderIdSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/)
  .transform((value) => value as PerpsClientOrderId);

export const PerpsTradeIdSchema = z
  .number()
  .int()
  .nonnegative()
  .transform(taggedInteger<PerpsTradeId>);

export const PerpsWithdrawalIdSchema = z
  .number()
  .int()
  .nonnegative()
  .transform(taggedInteger<PerpsWithdrawalId>);

export const PerpsInternalTransferIdSchema = z
  .number()
  .int()
  .nonnegative()
  .transform(taggedInteger<PerpsInternalTransferId>);

export const PerpsEntityIdSchema = z
  .number()
  .int()
  .positive()
  .transform(taggedInteger<PerpsEntityId>);

export const PerpsFundingIntervalSchema = z
  .string()
  .regex(/^[1-9]\d*h$/)
  .transform((value) => value as PerpsFundingInterval);

export const PerpsDecimalInputSchema = DecimalishSchema;
export type PerpsDecimalInput = z.input<typeof PerpsDecimalInputSchema>;

export enum PerpsInstrumentType {
  Perpetual = 'perpetual',
}

export enum PerpsInstrumentCategory {
  Equity = 'equity',
  Commodity = 'commodity',
  Index = 'index',
  Crypto = 'crypto',
}

export enum PerpsSide {
  Long = 'long',
  Short = 'short',
}

export enum PerpsTimeInForce {
  GTC = 'gtc',
  IOC = 'ioc',
  FOK = 'fok',
}

export enum PerpsTpSlKind {
  TakeProfit = 'tp',
  StopLoss = 'sl',
}

export enum PerpsTpSlScope {
  Order = 'order',
  Position = 'position',
}

export enum PerpsDepositStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Removed = 'removed',
}

export enum PerpsWithdrawalStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Removed = 'removed',
}

export enum PerpsInternalTransferDirection {
  In = 'in',
  Out = 'out',
}

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

export enum PerpsPnlInterval {
  OneHour = '1h',
  FourHours = '4h',
  OneDay = '1d',
  OneWeek = '1w',
}

export enum PerpsSortDirection {
  Descending = 'desc',
  Ascending = 'asc',
}

export const PerpsInstrumentTypeSchema = z.enum(PerpsInstrumentType);
export const PerpsInstrumentCategorySchema = z.enum(PerpsInstrumentCategory);
export const PerpsSideSchema = z.enum(PerpsSide);
export const PerpsTimeInForceSchema = z.enum(PerpsTimeInForce);
export const PerpsTpSlKindSchema = z.enum(PerpsTpSlKind);
export const PerpsTpSlScopeSchema = z.enum(PerpsTpSlScope);
export const PerpsDepositStatusSchema = z.enum(PerpsDepositStatus);
export const PerpsWithdrawalStatusSchema = z.enum(PerpsWithdrawalStatus);
export const PerpsInternalTransferDirectionSchema = z.enum(
  PerpsInternalTransferDirection,
);
export const PerpsKlineIntervalSchema = z.enum(PerpsKlineInterval);
export const PerpsPnlIntervalSchema = z.enum(PerpsPnlInterval);
export const PerpsSortDirectionSchema = z.enum(PerpsSortDirection);

export const PerpsAssetSchema = z.string().min(1);

export const PerpsTxHashSchema = z.preprocess(
  (hash) => (hash === '0x' || hash === '' ? undefined : hash),
  TxHashSchema.optional(),
);

export const PerpsDataResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    more: z.boolean(),
  });

export type PerpsCredentials = {
  proxy: EvmAddress;
  privateKey: PrivateKey;
  secret: string;
  expiresAt: number;
};

export type PerpsDepositAmount = BaseUnits;
export type PerpsWithdrawalAmount = BaseUnits;
export type PerpsTxHash = TxHash;
export type PerpsDecimal = DecimalString;

export function perpsDecimal(value: string | number): DecimalString {
  return PerpsDecimalInputSchema.parse(value);
}

export function perpsBaseUnits(value: string): BaseUnits {
  return BaseUnitsSchema.parse(value);
}

export function decimalString(value: string): DecimalString {
  return toDecimalString(value);
}
