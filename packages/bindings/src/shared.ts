import {
  type EvmAddress,
  expectEvmAddress,
  expectTxHash,
  type HexString,
  isHexString,
  type TxHash,
} from '@polymarket/types';
import { z } from 'zod';

type Tagged<T, Tag extends string> = T & { readonly __tag: Tag };

export enum CommentParentEntityType {
  Event = 'Event',
  Series = 'Series',
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderType {
  GTC = 'GTC',
  FOK = 'FOK',
  GTD = 'GTD',
  FAK = 'FAK',
}

/**
 * Lifecycle status of a trade, from creation through on-chain settlement.
 * `Confirmed` and `Failed` are the terminal states.
 * `MatchedNotBroadcasted` currently appears only on trades read via REST,
 * not on user stream trade events.
 */
export enum TradeStatus {
  Matched = 'TRADE_STATUS_MATCHED',
  MatchedNotBroadcasted = 'TRADE_STATUS_MATCHED_NOT_BROADCASTED',
  Mined = 'TRADE_STATUS_MINED',
  Confirmed = 'TRADE_STATUS_CONFIRMED',
  Retrying = 'TRADE_STATUS_RETRYING',
  Failed = 'TRADE_STATUS_FAILED',
}

function toTaggedString<T extends string>(value: string): T {
  return value as T;
}

function toTaggedInteger<T extends number>(value: number): T {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Expected an integer, received: ${value}`);
  }

  return value as T;
}

export type BestLineId = Tagged<string, 'BestLineId'>;
export type BuilderCode = Tagged<HexString, 'BuilderCode'>;
export type Uuid = Tagged<string, 'Uuid'>;
export type ApiKey = Tagged<string, 'ApiKey'>;
export type CategoryId = Tagged<string, 'CategoryId'>;
export type ChatId = Tagged<string, 'ChatId'>;
export type ClobRewardId = Tagged<string, 'ClobRewardId'>;
export type CommentId = Tagged<string, 'CommentId'>;
export type ComboActivityId = Tagged<string, 'ComboActivityId'>;
export type ComboConditionId = Tagged<HexString, 'ComboConditionId'>;
export type CtfConditionId = Tagged<HexString, 'CtfConditionId'>;
export type CollectionId = Tagged<string, 'CollectionId'>;
export type EventCreatorId = Tagged<string, 'EventCreatorId'>;
export type EventExternalPartnerMappingId = Tagged<
  number,
  'EventExternalPartnerMappingId'
>;
export type EpochMilliseconds = Tagged<number, 'EpochMilliseconds'>;
export type EventId = Tagged<string, 'EventId'>;
export type ImageOptimizationId = Tagged<string, 'ImageOptimizationId'>;
export type InternalUserId = Tagged<string, 'InternalUserId'>;
export type IsoCalendarDateString = Tagged<string, 'IsoCalendarDateString'>;
export type IsoDateTimeString = Tagged<string, 'IsoDateTimeString'>;
export type MarketId = Tagged<string, 'MarketId'>;
export type MixedDateTimeString = Tagged<string, 'MixedDateTimeString'>;
export type NotificationId = Tagged<number, 'NotificationId'>;
export type OrderId = Tagged<string, 'OrderId'>;
export type PartnerId = Tagged<number, 'PartnerId'>;
export type PaginationCursor = Tagged<string, 'PaginationCursor'>;
export type PositionId = Tagged<string, 'PositionId'>;
export type QuestionId = Tagged<HexString, 'QuestionId'>;
export type ResolutionRequestId = Tagged<HexString, 'ResolutionRequestId'>;
export type RfqId = Tagged<string, 'RfqId'>;
export type RfqQuoteId = Tagged<string, 'RfqQuoteId'>;
export type RfqRequestorPublicId = Tagged<string, 'RfqRequestorPublicId'>;
export type SeriesId = Tagged<string, 'SeriesId'>;
export type SportId = Tagged<number, 'SportId'>;
export type TagId = Tagged<string, 'TagId'>;
export type TeamId = Tagged<number, 'TeamId'>;
export type TemplateId = Tagged<string, 'TemplateId'>;
export type TransactionId = Tagged<string, 'TransactionId'>;
export type TokenId = Tagged<string, 'TokenId'>;
export type DecimalString = Tagged<string, 'DecimalString'>;
export type BaseUnits = Tagged<string, 'BaseUnits'>;

export function toBestLineId(value: string): BestLineId {
  return toTaggedString<BestLineId>(value);
}

export function toBuilderCode(value: string): BuilderCode {
  if (!isHexString(value) || value.length !== 66) {
    throw new TypeError(`Expected a 32-byte hex string, received: ${value}`);
  }

  return value as BuilderCode;
}

export function toUuid(value: string): Uuid {
  return toTaggedString<Uuid>(value);
}

export function toApiKey(value: string): ApiKey {
  return toTaggedString<ApiKey>(value);
}

export function toCategoryId(value: string): CategoryId {
  return toTaggedString<CategoryId>(value);
}

export function toChatId(value: string): ChatId {
  return toTaggedString<ChatId>(value);
}

export function toClobRewardId(value: string): ClobRewardId {
  return toTaggedString<ClobRewardId>(value);
}

export function toCommentId(value: string): CommentId {
  return toTaggedString<CommentId>(value);
}

export function toComboActivityId(value: string): ComboActivityId {
  return toTaggedString<ComboActivityId>(value);
}

export function toCtfConditionId(value: string): CtfConditionId {
  if (!isHexString(value) || (value.length !== 64 && value.length !== 66)) {
    throw new TypeError(
      `Expected a 31-byte or 32-byte hex string, received: ${value}`,
    );
  }

  return value as CtfConditionId;
}

export function toComboConditionId(value: string): ComboConditionId {
  if (!isHexString(value)) {
    throw new TypeError(
      `Expected a protocol v2 combo condition ID, received: ${value}`,
    );
  }

  const normalized = value.toLowerCase();

  if (normalized.length === 64 && normalized.startsWith('0x03')) {
    return normalized as ComboConditionId;
  }

  if (
    normalized.length === 66 &&
    normalized.startsWith('0x03') &&
    (normalized.endsWith('00') || normalized.endsWith('01'))
  ) {
    return normalized.slice(0, -2) as ComboConditionId;
  }

  throw new TypeError(
    `Expected a protocol v2 combo condition ID, received: ${value}`,
  );
}

export function toCollectionId(value: string): CollectionId {
  return toTaggedString<CollectionId>(value);
}

export function toEventCreatorId(value: string): EventCreatorId {
  return toTaggedString<EventCreatorId>(value);
}

export function toEventExternalPartnerMappingId(
  value: number,
): EventExternalPartnerMappingId {
  return toTaggedInteger<EventExternalPartnerMappingId>(value);
}

export function toEpochMilliseconds(value: number): EpochMilliseconds {
  return toTaggedInteger<EpochMilliseconds>(value);
}

export function toEventId(value: string): EventId {
  return toTaggedString<EventId>(value);
}

export function toImageOptimizationId(value: string): ImageOptimizationId {
  return toTaggedString<ImageOptimizationId>(value);
}

export function toInternalUserId(value: string): InternalUserId {
  return toTaggedString<InternalUserId>(value);
}

export function toIsoCalendarDateString(value: string): IsoCalendarDateString {
  return toTaggedString<IsoCalendarDateString>(value);
}

export function toIsoDateTimeString(value: string): IsoDateTimeString {
  return toTaggedString<IsoDateTimeString>(value);
}

export function toMixedDateTimeString(value: string): MixedDateTimeString {
  return toTaggedString<MixedDateTimeString>(value);
}

export function toMarketId(value: string): MarketId {
  return toTaggedString<MarketId>(value);
}

export function toNotificationId(value: number): NotificationId {
  return toTaggedInteger<NotificationId>(value);
}

export function toOrderId(value: string): OrderId {
  return toTaggedString<OrderId>(value);
}

export function toPartnerId(value: number): PartnerId {
  return toTaggedInteger<PartnerId>(value);
}

export function toPaginationCursor(value: string): PaginationCursor {
  return toTaggedString<PaginationCursor>(value);
}

export function toPositionId(value: string): PositionId {
  return toTaggedString<PositionId>(value);
}

export function toQuestionId(value: string): QuestionId {
  return to32ByteHexString(value) as QuestionId;
}

export function toResolutionRequestId(value: string): ResolutionRequestId {
  return to32ByteHexString(value) as ResolutionRequestId;
}

export function toRfqId(value: string): RfqId {
  return toTaggedString<RfqId>(value);
}

export function toRfqQuoteId(value: string): RfqQuoteId {
  return toTaggedString<RfqQuoteId>(value);
}

export function toRfqRequestorPublicId(value: string): RfqRequestorPublicId {
  return toTaggedString<RfqRequestorPublicId>(value);
}

export function toSeriesId(value: string): SeriesId {
  return toTaggedString<SeriesId>(value);
}

export function toSportId(value: number): SportId {
  return toTaggedInteger<SportId>(value);
}

export function toTagId(value: string): TagId {
  return toTaggedString<TagId>(value);
}

export function toTeamId(value: number): TeamId {
  return toTaggedInteger<TeamId>(value);
}

export function toTemplateId(value: string): TemplateId {
  return toTaggedString<TemplateId>(value);
}

export function toTransactionId(value: string): TransactionId {
  return toTaggedString<TransactionId>(value);
}

export function toTokenId(value: string): TokenId {
  return toTaggedString<TokenId>(value);
}

export function toDecimalString(value: string): DecimalString {
  return toTaggedString<DecimalString>(value);
}

export function toBaseUnits(value: string): BaseUnits {
  return toTaggedString<BaseUnits>(value);
}

export const CategoryIdSchema = z.string().transform(toCategoryId);
export const ApiKeySchema = z.string().transform(toApiKey);
export const BuilderCodeSchema = z.string().transform(toBuilderCode);
export const ClobRewardIdSchema = z.string().transform(toClobRewardId);
export const CommentIdSchema = z.string().transform(toCommentId);
export const ComboActivityIdSchema = z.string().transform(toComboActivityId);
export const ComboConditionIdSchema = z.string().transform(toComboConditionId);
export const CtfConditionIdSchema = z.string().transform(toCtfConditionId);
export const OptionalCtfConditionIdSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  CtfConditionIdSchema.optional(),
);
export const EvmAddressSchema = z.string().transform(toEvmAddress);
export const EpochMillisecondsSchema = z
  .number()
  .int()
  .transform(toEpochMilliseconds);
export const EpochSecondsToMillisecondsSchema = z
  .number()
  .int()
  .transform((value) => toEpochMilliseconds(value * 1000));
const EpochMillisecondsLikeSchema = z.union([
  z.number().int(),
  z.string().regex(/^\d+$/).transform(Number),
]);
const DateLikeStringToIsoDateTimeStringSchema = z
  .string()
  .transform((value) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return toIsoDateTimeString(
        new Date(`${value}T00:00:00.000Z`).toISOString(),
      );
    }

    return toIsoDateTimeString(value);
  });
export const EpochMillisecondsStringSchema = z
  .string()
  .regex(/^\d+$/)
  .transform((value) => toEpochMilliseconds(Number(value)));
export const DateLikeToIsoDateTimeStringSchema = z.union([
  EpochMillisecondsLikeSchema.transform((value) =>
    toIsoDateTimeString(new Date(value).toISOString()),
  ),
  DateLikeStringToIsoDateTimeStringSchema,
]);
export const EpochLikeToIsoDateTimeStringSchema = z.union([
  EpochMillisecondsLikeSchema.transform((value) =>
    toIsoDateTimeString(
      new Date(value < 1_000_000_000_000 ? value * 1000 : value).toISOString(),
    ),
  ),
  DateLikeStringToIsoDateTimeStringSchema,
]);
export const OptionalDateLikeToIsoDateTimeStringSchema = z.union([
  EpochMillisecondsLikeSchema.transform((value) =>
    value === 0
      ? undefined
      : toIsoDateTimeString(new Date(value).toISOString()),
  ),
  DateLikeStringToIsoDateTimeStringSchema,
]);
export const OptionalEpochLikeToIsoDateTimeStringSchema = z.union([
  EpochMillisecondsLikeSchema.transform((value) =>
    value === 0
      ? undefined
      : toIsoDateTimeString(
          new Date(
            value < 1_000_000_000_000 ? value * 1000 : value,
          ).toISOString(),
        ),
  ),
  DateLikeStringToIsoDateTimeStringSchema,
]);
export const EpochMillisecondsToIsoDateTimeStringSchema =
  DateLikeToIsoDateTimeStringSchema;
export const OptionalEpochMillisecondsToIsoDateTimeStringSchema =
  OptionalDateLikeToIsoDateTimeStringSchema;
export const EventIdSchema = z
  .union([z.string(), z.number().int().transform(String)])
  .transform(toEventId);
export const TickSizeValueSchema = z.union([
  z.literal(0.1),
  z.literal(0.01),
  z.literal(0.005),
  z.literal(0.0025),
  z.literal(0.001),
  z.literal(0.0001),
]);
export const IsoDateTimeStringSchema = z
  .string()
  .transform(toIsoDateTimeString)
  .or(z.date().transform((value) => toIsoDateTimeString(value.toISOString())));
export const IsoCalendarDateStringSchema = z
  .string()
  .transform(toIsoCalendarDateString)
  .or(
    z
      .date()
      .transform((value) =>
        toIsoCalendarDateString(value.toISOString().slice(0, 10)),
      ),
  );
export const MixedDateTimeStringSchema = z
  .string()
  .transform(toMixedDateTimeString);
export const ISODateStringSchema = IsoDateTimeStringSchema;
export const ISOCalendarDateSchema = IsoCalendarDateStringSchema;
export const ImageOptimizationIdSchema = z
  .string()
  .transform(toImageOptimizationId);
export const InternalUserIdSchema = z.string().transform(toInternalUserId);
export const MarketIdSchema = z.string().transform(toMarketId);
export const NotificationIdSchema = z
  .number()
  .int()
  .transform(toNotificationId);
export const CommentParentEntityTypeSchema = z.enum(CommentParentEntityType);
export const OrderIdSchema = z.string().transform(toOrderId);
export const OrderSideSchema = z.enum(OrderSide);
export const OrderTypeSchema = z.enum(OrderType);
// Trade statuses arrive in two wire forms: REST endpoints serialize the raw
// prefixed constants ("TRADE_STATUS_CONFIRMED") while the user websocket
// channel serializes plain values ("CONFIRMED"). Normalize both to the enum.
export const TradeStatusSchema = z.preprocess((value) => {
  if (typeof value !== 'string' || value.startsWith('TRADE_STATUS_')) {
    return value;
  }

  const normalized = Object.values(TradeStatus).find(
    (status) => status.slice('TRADE_STATUS_'.length) === value,
  );

  return normalized ?? value;
}, z.enum(TradeStatus));
export const PaginationCursorSchema = z.custom<PaginationCursor>(
  (value) => typeof value === 'string' && value.length > 0,
  'Expected a non-empty pagination cursor',
);
export const PositionIdSchema = z.string().transform(toPositionId);
export const QuestionIdSchema = z.string().transform(toQuestionId);
export const ResolutionRequestIdSchema = z
  .string()
  .transform(toResolutionRequestId);
export const RfqIdSchema = z.string().transform(toRfqId);
export const RfqQuoteIdSchema = z.string().transform(toRfqQuoteId);
export const RfqRequestorPublicIdSchema = z
  .string()
  .transform(toRfqRequestorPublicId);
export const TagIdSchema = z.string().transform(toTagId);
export const TokenIdSchema = z.string().transform(toTokenId);
export const TransactionIdSchema = z.string().min(1).transform(toTransactionId);
export const TxHashSchema = z.string().transform(toTxHash);
export const DecimalStringSchema = z.string().transform(toDecimalString);
export const E6BigIntStringToDecimalStringSchema = z
  .string()
  .regex(/^\d+$/)
  .transform((value) => {
    const scaledValue = BigInt(value);
    const whole = scaledValue / 1_000_000n;
    const fraction = (scaledValue % 1_000_000n)
      .toString()
      .padStart(6, '0')
      .replace(/0+$/, '');

    return toDecimalString(`${whole}${fraction === '' ? '' : `.${fraction}`}`);
  });
export const DecimalishSchema = z.union([
  DecimalStringSchema,
  z.number().transform((value) => toDecimalString(String(value))),
]);
export const PositiveDecimalNumberSchema = z
  .union([z.number(), z.string().transform(Number)])
  .pipe(z.number().positive());
export const BaseUnitsSchema = z.string().transform(toBaseUnits);

export type ISODateString = IsoDateTimeString;
export type ISOCalendarDateString = IsoCalendarDateString;
export type TickSizeValue = z.output<typeof TickSizeValueSchema>;

export type { EvmAddress, TxHash };

/**
 * Preprocess helper for upstream fields that serialize missing values as empty
 * strings. Use as `z.preprocess(emptyStringToNull, Schema.nullable())`, or
 * with `.nullish()` when the field can also be absent.
 */
export function emptyStringToNull(value: unknown): unknown {
  return value === '' ? null : value;
}

/**
 * Optional decimal field whose upstream serialization uses an empty string
 * for missing values. Normalizes `''` to `null` so consumers never receive
 * an empty `DecimalString`; populated values parse as `DecimalStringSchema`.
 */
export const OptionalDecimalStringSchema = z.preprocess(
  emptyStringToNull,
  DecimalStringSchema.nullish(),
);

function toEvmAddress(value: string): EvmAddress {
  return expectEvmAddress(value);
}

function toTxHash(value: string): TxHash {
  return expectTxHash(value);
}

function to32ByteHexString(value: string): HexString {
  if (!isHexString(value) || value.length !== 66) {
    throw new TypeError(`Expected a 32-byte hex string, received: ${value}`);
  }

  return value;
}
