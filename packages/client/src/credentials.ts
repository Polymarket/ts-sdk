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
const ApiKeyCredentialsInputSchema: z.ZodType<ApiKeyCreds> = z.strictObject({
  key: ApiKeySchema,
  secret: z.string(),
  passphrase: z.string(),
});

const BearerCredentialsInputSchema = BearerCredentialsSchema.strict();

/** Validate normalized saved API-key credentials, including explicit migration input. @internal */
export const L2CredentialsSchema = ApiKeyCredentialsInputSchema;

/** Validate one complete mechanism; mixed or unknown fields match neither. @internal */
export const ClientCredentialsSchema = z.union([
  ApiKeyCredentialsInputSchema,
  BearerCredentialsInputSchema,
]);

/** Called after adoption of a refreshed token pair. Both tokens are secrets. */
export type CredentialsChanged = (
  credentials: BearerCredentials,
) => void | Promise<void>;
