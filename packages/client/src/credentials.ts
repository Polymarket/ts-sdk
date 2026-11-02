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

/** Saved bearer credentials. Both tokens are secrets. */
export type BearerSessionCredentials = {
  type: 'bearer';
  accessToken: string;
  refreshToken: string;
};
/** Saved L2 credentials, including the key used to identify trading orders. */
export type L2SessionCredentials = ApiKeyCreds & { type: 'l2' };
/** Narrow by `type` before using authentication-specific fields. */
export type AuthenticatedCredentials =
  | BearerSessionCredentials
  | L2SessionCredentials;
/** Credentials accepted when restoring a secure client: a value saved from `client.credentials`, or L2 credentials saved by an earlier SDK version without `type`. */
export type SavedCredentials =
  | BearerSessionCredentials
  | { type?: 'l2'; key: string; secret: string; passphrase: string };
export type CredentialsChanged = (
  credentials: BearerSessionCredentials,
) => void | Promise<void>;

/** Validate credentials saved from `client.credentials`, or L2 credentials saved before they carried a `type`. @internal */
export const RestoredCredentialsSchema = z.union([
  z
    .strictObject({
      type: z.literal('bearer'),
      accessToken: z.string().min(1),
      refreshToken: z.string().min(1),
    })
    .transform(
      ({ accessToken, refreshToken }): BearerCredentials => ({
        accessToken,
        refreshToken,
      }),
    ),
  z
    .strictObject({
      type: z.literal('l2'),
      key: ApiKeySchema,
      secret: z.string(),
      passphrase: z.string(),
    })
    .transform(
      ({ key, secret, passphrase }): ApiKeyCreds => ({
        key,
        secret,
        passphrase,
      }),
    ),
  ApiKeyCredentialsInputSchema,
]);

/** @internal */
export function savedBearerCredentials(
  credentials: BearerCredentials,
): BearerSessionCredentials {
  return {
    type: 'bearer',
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
  };
}
