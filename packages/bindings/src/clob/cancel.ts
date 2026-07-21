import { z } from 'zod';
import { OrderIdSchema } from '../shared';

export const CancelOrdersResponseSchema = z
  .object({
    canceled: z.array(OrderIdSchema),
    not_canceled: z.record(OrderIdSchema, z.string()),
  })
  .transform(({ canceled, not_canceled }) => ({
    canceled,
    notCanceled: not_canceled,
  }));

export type CancelOrdersResponse = z.infer<typeof CancelOrdersResponseSchema>;
