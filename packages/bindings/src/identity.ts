import { z } from 'zod';
import { BearerCredentialsSchema } from './credentials';
import { EvmAddressSchema } from './shared';

/**
 * A login, migration or refresh response. `expiresIn` is the access token's
 * lifetime in seconds when the response was issued, so clients can schedule
 * renewal without trusting their own clock against the token's `exp` claim.
 */
export const TokenResponseSchema = BearerCredentialsSchema.extend({
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
  refreshExpiresIn: z.number().int().nonnegative(),
}).transform(({ accessToken, refreshToken, expiresIn }) => ({
  accessToken,
  refreshToken,
  expiresIn,
}));
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

/**
 * A session upgrade response. It carries a new access token only. The refresh
 * token of the session does not change.
 */
export const AccessTokenResponseSchema = z
  .object({
    accessToken: z.string().min(1),
    tokenType: z.literal('Bearer'),
    expiresIn: z.number().int().positive(),
  })
  .transform(({ accessToken, expiresIn }) => ({ accessToken, expiresIn }));
export type AccessTokenResponse = z.infer<typeof AccessTokenResponseSchema>;

const DecimalStringSchema = z.string().regex(/^\d+$/);

function typedDataField<TName extends string, TType extends string>(
  name: TName,
  type: TType,
) {
  return z.object({ name: z.literal(name), type: z.literal(type) }).strict();
}

/**
 * An ownership challenge. Its typed data is always the `ClobAuth` attestation
 * under the `ClobAuthDomain` domain. Any other payload is rejected before a
 * wallet is asked to sign it. Unknown domain, type or message fields are
 * rejected rather than stripped, because removing them would change the
 * signed payload.
 */
export const OwnershipChallengeSchema = z.object({
  challengeId: z.uuid(),
  expiresAt: z.iso.datetime(),
  typedData: z.object({
    domain: z
      .object({
        name: z.literal('ClobAuthDomain'),
        version: z.literal('1'),
        chainId: z.number().int().positive(),
      })
      .strict(),
    types: z
      .object({
        EIP712Domain: z.tuple([
          typedDataField('name', 'string'),
          typedDataField('version', 'string'),
          typedDataField('chainId', 'uint256'),
        ]),
        ClobAuth: z.tuple([
          typedDataField('address', 'address'),
          typedDataField('timestamp', 'string'),
          typedDataField('nonce', 'uint256'),
          typedDataField('message', 'string'),
        ]),
      })
      .strict(),
    primaryType: z.literal('ClobAuth'),
    message: z
      .object({
        address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        timestamp: DecimalStringSchema,
        nonce: DecimalStringSchema,
        message: z.literal(
          'This message attests that I control the given wallet',
        ),
      })
      .strict(),
  }),
});

// Claims are decoded for lifecycle scheduling and identity continuity only.
// Authentication and signature verification remain the server's responsibility.
export const AccessTokenClaimsSchema = z.object({
  exp: z.number().int().positive(),
  sub: EvmAddressSchema,
  client_id: z.string().optional(),
  wallet: EvmAddressSchema.optional(),
  signature_type: z.number().int().min(0).max(3).optional(),
  clob_api_key: z.string().optional(),
});
export type AccessTokenClaims = z.infer<typeof AccessTokenClaimsSchema>;
export const SocketAuthResponseSchema = z.object({
  type: z.literal('auth'),
  success: z.boolean(),
});
