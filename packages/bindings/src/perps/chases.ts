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

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsChaseId = number & { readonly __tag: 'PerpsChaseId' };
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsChaseIdSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)
  .transform((value) => value as PerpsChaseId);
const DecimalSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/)
  .pipe(DecimalStringSchema);
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsChaseSchema = z
  .object({
    chid: PerpsChaseIdSchema,
    iid: PerpsInstrumentIdSchema,
    buy: z.boolean(),
    qty: DecimalSchema,
    fill: DecimalSchema,
    lim: DecimalSchema,
    max_dist: DecimalSchema,
    max_dist_bps: z.number().int().min(0).max(1000),
    po: z.boolean(),
    ro: z.boolean(),
    reference_price: DecimalSchema,
    reprices: z.number().int().nonnegative(),
    post_only_rejections: z.number().int().nonnegative(),
    cts: EpochMillisecondsSchema,
    coid: PerpsClientOrderIdSchema.optional(),
    oid: PerpsOrderIdSchema.optional(),
  })
  .transform((chase) => ({
    chaseId: chase.chid,
    instrumentId: chase.iid,
    side: chase.buy ? OrderSide.BUY : OrderSide.SELL,
    quantity: chase.qty,
    filledQuantity: chase.fill,
    limitPrice: chase.lim,
    maxDistance: chase.max_dist,
    maxDistanceBps: chase.max_dist_bps,
    postOnly: chase.po,
    reduceOnly: chase.ro,
    referencePrice: chase.reference_price,
    reprices: chase.reprices,
    postOnlyRejections: chase.post_only_rejections,
    createdAt: chase.cts,
    ...(chase.coid === undefined ? {} : { clientOrderId: chase.coid }),
    ...(chase.oid === undefined ? {} : { orderId: chase.oid }),
  }));
/** A running chase. Zero bounds are unset; reference price is zero before the first resting child.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsChase = z.infer<typeof PerpsChaseSchema>;
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PerpsChaseAcceptedSchema = z
  .object({
    status: z.literal('ok'),
    chid: PerpsChaseIdSchema,
    ts: EpochMillisecondsSchema,
  })
  .transform((accepted) => ({
    chaseId: accepted.chid,
    timestamp: accepted.ts,
  }));
/** Acceptance does not guarantee a child has rested or any quantity will fill.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsChaseAccepted = z.infer<typeof PerpsChaseAcceptedSchema>;
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const FetchPerpsChasesResponseSchema = z.array(PerpsChaseSchema);
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const CreatePerpsChaseResponseSchema = z.union([
  PerpsChaseAcceptedSchema,
  z.object({ status: z.literal('err'), error: z.string().min(1) }),
]);
