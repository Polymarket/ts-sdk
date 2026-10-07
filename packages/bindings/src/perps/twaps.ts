import { z } from 'zod';
import {
  DecimalStringSchema,
  EpochMillisecondsSchema,
  OrderSide,
} from '../shared';
import {
  PerpsClientOrderIdSchema,
  PerpsInstrumentIdSchema,
  PerpsOrderIdSchema,
} from './common';

/** Opaque run identity.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsTwapId = number & { readonly __tag: 'PerpsTwapId' };
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsTwapIdSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)
  .transform((value) => value as PerpsTwapId);
/** Active runs only; ended runs are absent from the active collection.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum PerpsTwapStatus {
  Running = 'running',
  Paused = 'paused',
}
const DecimalSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .pipe(DecimalStringSchema);
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsTwapSchema = z
  .object({
    twid: PerpsTwapIdSchema,
    iid: PerpsInstrumentIdSchema,
    buy: z.boolean(),
    qty: DecimalSchema,
    fill: DecimalSchema,
    dur: z.number().int().positive(),
    ivl: z.number().int().positive(),
    rnd: z.boolean(),
    slip_bps: z.number().int().min(0).max(10000),
    min_px: DecimalSchema,
    max_px: DecimalSchema,
    ro: z.boolean(),
    st: z.enum(PerpsTwapStatus),
    slices: z.number().int().nonnegative(),
    slice_count: z.number().int().positive(),
    sts: EpochMillisecondsSchema,
    ets: EpochMillisecondsSchema,
    cts: EpochMillisecondsSchema,
    avg_px: DecimalSchema.optional(),
    coid: PerpsClientOrderIdSchema.optional(),
    oid: PerpsOrderIdSchema.optional(),
  })
  .transform((run) => ({
    twapId: run.twid,
    instrumentId: run.iid,
    side: run.buy ? OrderSide.BUY : OrderSide.SELL,
    quantity: run.qty,
    filledQuantity: run.fill,
    durationMs: run.dur,
    intervalMs: run.ivl,
    randomize: run.rnd,
    slippageBps: run.slip_bps,
    minPrice: run.min_px,
    maxPrice: run.max_px,
    reduceOnly: run.ro,
    status: run.st,
    slices: run.slices,
    sliceCount: run.slice_count,
    startedAt: run.sts,
    endsAt: run.ets,
    createdAt: run.cts,
    ...(run.avg_px === undefined ? {} : { averagePrice: run.avg_px }),
    ...(run.coid === undefined ? {} : { clientOrderId: run.coid }),
    ...(run.oid === undefined ? {} : { orderId: run.oid }),
  }));
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsTwap = z.infer<typeof PerpsTwapSchema>;
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsTwapAcceptedSchema = z
  .object({
    status: z.literal('ok'),
    twid: PerpsTwapIdSchema,
    ts: EpochMillisecondsSchema,
  })
  .transform((accepted) => ({ twapId: accepted.twid, timestamp: accepted.ts }));
/** Acceptance does not guarantee all scheduled quantity will fill.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsTwapAccepted = z.infer<typeof PerpsTwapAcceptedSchema>;
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const FetchPerpsTwapsResponseSchema = z.array(PerpsTwapSchema);
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const CreatePerpsTwapResponseSchema = z.union([
  PerpsTwapAcceptedSchema,
  z.object({ status: z.literal('err'), error: z.string().min(1) }),
]);
