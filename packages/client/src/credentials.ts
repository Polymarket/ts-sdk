import {
  ApiKeySchema,
  type BearerCredentials,
  BearerCredentialsSchema,
} from '@polymarket/bindings';
import type { ApiKeyCreds } from '@polymarket/bindings/clob';
import { z } from 'zod';

/** Saved credentials for either supported authentication mechanism. */
export type ClientCredentials = ApiKeyCreds | BearerCredentials;

// ApiKeyCredsSchema parses the wire field `apiKey`; saved credentials use `key`.
const ApiKeyCredentialsInputSchema: z.ZodType<ApiKeyCreds> = z.object({
  key: ApiKeySchema,
  secret: z.string(),
  passphrase: z.string(),
});

function rejectMixedCredentials(
  value: unknown,
  context: z.RefinementCtx,
): unknown {
  if (
    value !== null &&
    typeof value === 'object' &&
    ('key' in value || 'secret' in value || 'passphrase' in value) &&
    ('accessToken' in value || 'refreshToken' in value)
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Credentials must contain one authentication mechanism.',
    });
  }
  return value;
}

/** Validate normalized saved API-key credentials, including explicit migration input. @internal */
export const L2CredentialsSchema = z.preprocess(
  rejectMixedCredentials,
  ApiKeyCredentialsInputSchema,
);

/** Validate one complete mechanism without silently selecting mixed credentials. @internal */
export const ClientCredentialsSchema = z.preprocess(
  rejectMixedCredentials,
  z.union([ApiKeyCredentialsInputSchema, BearerCredentialsSchema]),
);
