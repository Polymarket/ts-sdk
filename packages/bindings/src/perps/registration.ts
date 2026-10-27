import { z } from 'zod';

/**
 * Parses whether an address has a Perps account.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsRegistrationResponseSchema = z
  .object({ registered: z.boolean() })
  .transform((response) => response.registered);
