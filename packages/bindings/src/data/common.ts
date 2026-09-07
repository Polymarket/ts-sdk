import { z } from 'zod';
import { type ConditionId, ConditionIdSchema, toConditionId } from '../shared';

export enum ActivityType {
  TRADE = 'TRADE',
  SPLIT = 'SPLIT',
  MERGE = 'MERGE',
  REDEEM = 'REDEEM',
  REWARD = 'REWARD',
  CONVERSION = 'CONVERSION',
  MIGRATION = 'MIGRATION',
  MAKER_REBATE = 'MAKER_REBATE',
  REFERRAL_REWARD = 'REFERRAL_REWARD',
  YIELD = 'YIELD',
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TAKER_REBATE = 'TAKER_REBATE',
  /** A user-to-user tip, served in the feed like every other type. */
  TIP = 'TIP',
}

export const ActivityTypeSchema = z.enum(ActivityType);

/** Direction of a TIP from the row wallet's perspective. */
export enum TipSide {
  In = 'IN',
  Out = 'OUT',
}

export const TipSideSchema = z.enum(TipSide);

/** Sort order of a listed feed. */
export enum SortDirection {
  Asc = 'ASC',
  Desc = 'DESC',
}

export const SortDirectionSchema = z.enum(SortDirection);

/** Unit the trades dust filter applies to. */
export enum TradeFilterType {
  Cash = 'CASH',
  Tokens = 'TOKENS',
}

export const TradeFilterTypeSchema = z.enum(TradeFilterType);

function toCanonicalMarketConditionId(conditionId: ConditionId): ConditionId {
  const paddedConditionId =
    conditionId.length === 64 ? `${conditionId}00` : conditionId;

  return toConditionId(paddedConditionId.toLowerCase());
}

function isSupportedMarketConditionId(conditionId: ConditionId): boolean {
  if (conditionId.length === 66) return true;

  const normalizedConditionId = conditionId.toLowerCase();
  return (
    normalizedConditionId.startsWith('0x01') ||
    normalizedConditionId.startsWith('0x02')
  );
}

/**
 * A canonical 32-byte market condition ID. A 31-byte protocol v2 market ID is
 * right-padded to its canonical representation; combo condition IDs are
 * rejected.
 */
export const CanonicalMarketConditionIdSchema = ConditionIdSchema.refine(
  isSupportedMarketConditionId,
  'Expected a 32-byte condition ID or a 31-byte protocol v2 market condition ID',
).transform(toCanonicalMarketConditionId);
