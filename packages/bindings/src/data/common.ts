import { z } from 'zod';
import { DirectionalConditionIdSchema } from '../protocol';
import { type ConditionId, ConditionIdSchema, toConditionId } from '../shared';

/**
 * Activity types this SDK version lists. New types can appear in the activity
 * feed before a release lists them. Those rows have an
 * {@link OpaqueActivityType}.
 */
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
  /** Collateral and range-event buckets split into two line positions. */
  DIRECTIONAL_SPLIT = 'DIRECTIONAL_SPLIT',
  /** Two range-event line positions merged into collateral and buckets. */
  DIRECTIONAL_MERGE = 'DIRECTIONAL_MERGE',
  /** Range-event buckets composed into one line position. */
  THRESHOLD_COMPOSE = 'THRESHOLD_COMPOSE',
  /** A range-event line position decomposed into buckets. */
  THRESHOLD_DECOMPOSE = 'THRESHOLD_DECOMPOSE',
}

export const ActivityTypeSchema = z.enum(ActivityType);

declare const opaqueActivityType: unique symbol;

/**
 * The type of an activity this SDK version does not list in
 * {@link ActivityType}. It never overlaps a listed type, so comparing
 * `activity.type` with an {@link ActivityType} member still narrows the row.
 * At runtime it holds the type as served, so do not narrow on
 * `typeof activity.type`.
 *
 * Because of this type, `activity.type` is not assignable to `string` and
 * cannot index a record. Read the served type with `String(activity.type)`.
 *
 * @example
 * ```ts
 * const labels: Partial<Record<string, string>> = {
 *   [ActivityType.TRADE]: 'Trade',
 * };
 *
 * // Before: labels[activity.type]
 * const label = labels[String(activity.type)] ?? 'Other';
 * ```
 */
export type OpaqueActivityType = {
  readonly [opaqueActivityType]: 'OpaqueActivityType';
};

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
    normalizedConditionId.startsWith('0x02') ||
    (normalizedConditionId.startsWith('0x04') &&
      DirectionalConditionIdSchema.safeParse(normalizedConditionId).success)
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
