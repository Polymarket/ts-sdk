import { z } from 'zod';
import {
  EventIdSchema,
  EvmAddressSchema,
  IsoDateTimeStringSchema,
  QuestionIdSchema,
  TxHashSchema,
  toMarketId,
} from '../shared';

/** Lifecycle state of a clarification as it is scheduled and posted on-chain. */
export enum MarketClarificationState {
  Pending = 'pending',
  Queued = 'queued',
  Success = 'success',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

// The upstream payload returns `marketId` as a JSON number, but the `MarketId`
// brand is string-valued, so accept number-or-string here (mirrors `EventIdSchema`).
const MarketIdFromWireSchema = z
  .union([z.string(), z.number().int().transform(String)])
  .transform(toMarketId);

export const MarketClarificationSchema = z.object({
  id: z.number().int(),
  marketId: MarketIdFromWireSchema.nullish(),
  eventId: EventIdSchema.nullish(),
  questionId: QuestionIdSchema.nullish(),
  content: z.string().nullish(),
  state: z.enum(MarketClarificationState).nullish(),
  clearBook: z.boolean().nullish(),
  notifyDiscord: z.boolean().nullish(),
  showInFrontend: z.boolean().nullish(),
  adapterAddress: EvmAddressSchema.nullish(),
  negRiskRequestId: z.string().nullish(),
  txHash: TxHashSchema.nullish(),
  createdAt: IsoDateTimeStringSchema.nullish(),
  queuedAt: IsoDateTimeStringSchema.nullish(),
  scheduledFor: IsoDateTimeStringSchema.nullish(),
  txTimestamp: IsoDateTimeStringSchema.nullish(),
});

export const ListMarketClarificationsResponseSchema = z.array(
  MarketClarificationSchema,
);

export type MarketClarification = z.infer<typeof MarketClarificationSchema>;
export type ListMarketClarificationsResponse = z.infer<
  typeof ListMarketClarificationsResponseSchema
>;
