import { z } from 'zod';
import { DecimalStringSchema, EpochMillisecondsSchema } from '../shared';
import {
  type PerpsInstrumentId,
  PerpsInstrumentIdSchema,
  PerpsSide,
} from './common';

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export enum PerpsPositionSnapshotStatus {
  Ok = 'ok',
  NotFound = 'not_found',
  HistoryPending = 'history_pending',
  HistoryLimit = 'history_limit',
  ResourceLimit = 'resource_limit',
  TemporarilyUnavailable = 'temporarily_unavailable',
  Unavailable = 'unavailable',
}

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export enum PerpsPositionSnapshotMarkerKind {
  Increase = 'increase',
  Decrease = 'decrease',
}

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsPositionSnapshotCandleSchema = z.object({
  position: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
});
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsPositionSnapshotCandle = z.infer<
  typeof PerpsPositionSnapshotCandleSchema
>;
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsPositionSnapshotMarkerSchema = z.object({
  position: z.number(),
  kind: z.enum(PerpsPositionSnapshotMarkerKind),
});
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsPositionSnapshotMarker = z.infer<
  typeof PerpsPositionSnapshotMarkerSchema
>;
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsPositionSnapshotChartSchema = z.object({
  candles: z.array(PerpsPositionSnapshotCandleSchema).max(22),
  markers: z.array(PerpsPositionSnapshotMarkerSchema).max(256),
});
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsPositionSnapshotChart = z.infer<
  typeof PerpsPositionSnapshotChartSchema
>;

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsPositionSnapshotSchema = z
  .object({
    position_cycle_id: z.string(),
    side: z.enum(PerpsSide),
    started_at: EpochMillisecondsSchema,
    as_of_at: EpochMillisecondsSchema,
    is_closed: z.boolean(),
    size_after: DecimalStringSchema,
    entry_price: DecimalStringSchema,
    as_of_price: DecimalStringSchema,
    pnl: DecimalStringSchema,
    pnl_percent: DecimalStringSchema.nullable(),
    leverage: z.number().int().nonnegative().nullable(),
    chart: PerpsPositionSnapshotChartSchema,
  })
  .transform((snapshot) => ({
    positionCycleId: snapshot.position_cycle_id,
    side: snapshot.side,
    startedAt: snapshot.started_at,
    asOfAt: snapshot.as_of_at,
    isClosed: snapshot.is_closed,
    sizeAfter: snapshot.size_after,
    entryPrice: snapshot.entry_price,
    asOfPrice: snapshot.as_of_price,
    pnl: snapshot.pnl,
    pnlPercent: snapshot.pnl_percent,
    leverage: snapshot.leverage,
    chart: snapshot.chart,
  }));
/** A position cycle valued at captured state or immediately after a selected fill.
 * @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsPositionSnapshot = z.infer<typeof PerpsPositionSnapshotSchema>;

const TradeIdSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,19})$/)
  .refine(
    (value) =>
      /^[0-9]{1,20}$/.test(value) && BigInt(value) <= 18446744073709551615n,
  );
const IdentitySchema = z.object({
  instrument_id: PerpsInstrumentIdSchema,
  trade_id: TradeIdSchema.optional(),
});
const ResultSchema = z
  .discriminatedUnion('status', [
    IdentitySchema.extend({
      status: z.literal(PerpsPositionSnapshotStatus.Ok),
      snapshot: PerpsPositionSnapshotSchema,
    }),
    IdentitySchema.extend({
      status: z.enum(PerpsPositionSnapshotStatus).exclude(['Ok']),
      snapshot: z.never().optional(),
    }),
  ])
  .transform((item): PerpsPositionSnapshotResult => {
    const identity = {
      instrumentId: item.instrument_id,
      ...(item.trade_id === undefined ? {} : { tradeId: item.trade_id }),
    };
    return item.status === PerpsPositionSnapshotStatus.Ok
      ? { ...identity, status: item.status, snapshot: item.snapshot }
      : { ...identity, status: item.status };
  });

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsPositionSnapshotResult =
  | {
      instrumentId: PerpsInstrumentId;
      tradeId?: string;
      status: PerpsPositionSnapshotStatus.Ok;
      snapshot: PerpsPositionSnapshot;
    }
  | {
      instrumentId: PerpsInstrumentId;
      tradeId?: string;
      status: Exclude<
        PerpsPositionSnapshotStatus,
        PerpsPositionSnapshotStatus.Ok
      >;
    };
const HistoryResultSchema = ResultSchema.transform((item, ctx) => {
  if (item.tradeId === undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'Historical snapshot requires trade_id',
    });
    return z.NEVER;
  }
  return { ...item, tradeId: item.tradeId };
});
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsHistoricalPositionSnapshotResult = z.infer<
  typeof HistoryResultSchema
>;

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsPositionSnapshotsSchema = z
  .object({
    history_as_of_at: EpochMillisecondsSchema,
    active: z.array(ResultSchema),
    history: z.array(HistoryResultSchema),
  })
  .transform((response) => ({
    historyAsOfAt: response.history_as_of_at,
    active: response.active,
    history: response.history,
  }));
/** Ordered selections and the completed-history horizon. No pagination.
 * @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsPositionSnapshots = z.infer<
  typeof PerpsPositionSnapshotsSchema
>;
