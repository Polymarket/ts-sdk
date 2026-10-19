import type { z } from 'zod';
import { UnexpectedResponseError } from './errors';

/** Validates an already parsed response value. @internal */
export function parseResponse<T>(
  endpoint: string,
  schema: z.ZodType<T>,
  response: unknown,
): T {
  try {
    const result = schema.safeParse(response);
    if (result.success) return result.data;
    throw UnexpectedResponseError.fromZodError(result.error, { endpoint });
  } catch (error) {
    if (error instanceof UnexpectedResponseError) throw error;
    throw new UnexpectedResponseError(
      `Could not validate response from ${endpoint}`,
      { cause: error },
    );
  }
}
