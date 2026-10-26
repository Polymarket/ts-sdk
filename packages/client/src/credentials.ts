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

/** Saved bearer credentials; the access token is used only for HTTP authentication. */
export type BearerSessionCredentials = {
  type: 'bearer';
  key: string;
  refreshToken: string;
};
/** Saved L2 credentials, including the key used to identify trading orders. */
export type L2SessionCredentials = ApiKeyCreds & { type: 'l2' };
/** Narrow by `type` before using authentication-specific fields. */
export type AuthenticatedCredentials =
  | BearerSessionCredentials
  | L2SessionCredentials;
export type CredentialsChanged = (
  credentials: BearerSessionCredentials,
) => void | Promise<void>;

const SavedCredentialsSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('bearer'),
      key: z.string().min(1),
      refreshToken: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('l2'),
      key: ApiKeySchema,
      secret: z.string(),
      passphrase: z.string(),
    })
    .strict(),
]);

/** Normalize saved credentials while continuing to accept wire-format restoration input. @internal */
export const RestoredCredentialsSchema = z.preprocess((value) => {
  if (value === null || typeof value !== 'object' || !('type' in value))
    return value;
  const saved = SavedCredentialsSchema.safeParse(value);
  if (!saved.success) return undefined;
  if (saved.data.type === 'l2') {
    const { type: _type, ...credentials } = saved.data;
    return credentials;
  }
  return { accessToken: saved.data.key, refreshToken: saved.data.refreshToken };
}, ClientCredentialsSchema);

/** @internal */
export function savedBearerCredentials(
  credentials: BearerCredentials,
): BearerSessionCredentials {
  return {
    type: 'bearer',
    key: credentials.accessToken,
    refreshToken: credentials.refreshToken,
  };
}
