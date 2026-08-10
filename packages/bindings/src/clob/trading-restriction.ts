import { z } from 'zod';

const RetryAfterSecondsSchema = z.number().finite().nonnegative().optional();

const PostOnlyResponseSchema = z.object({
  code: z.literal('post_only_mode'),
  error: z.string(),
  retry_after_seconds: RetryAfterSecondsSchema,
});

const CancelOnlyResponseSchema = z.object({
  error: z.literal(
    'Trading is currently cancel-only. New orders are not accepted, but cancels are allowed.',
  ),
  retry_after_seconds: RetryAfterSecondsSchema,
});

export enum TradingRestrictionResponseType {
  CANCEL_ONLY = 'cancel_only',
  POST_ONLY = 'post_only',
}

export const TradingRestrictionErrorResponseSchema = z
  .union([PostOnlyResponseSchema, CancelOnlyResponseSchema])
  .transform((response) => ({
    retryAfter: response.retry_after_seconds,
    type:
      'code' in response
        ? TradingRestrictionResponseType.POST_ONLY
        : TradingRestrictionResponseType.CANCEL_ONLY,
  }));

export type TradingRestrictionErrorResponse = z.infer<
  typeof TradingRestrictionErrorResponseSchema
>;
