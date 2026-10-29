import { z } from 'zod';
import { BearerCredentialsSchema } from './credentials';
import { EvmAddressSchema } from './shared';

export const TokenResponseSchema = BearerCredentialsSchema.extend({
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().nonnegative(),
  refreshExpiresIn: z.number().int().nonnegative(),
}).transform(({ accessToken, refreshToken }) => ({
  accessToken,
  refreshToken,
}));

export const OwnershipChallengeSchema = z.object({
  challengeId: z.uuid(),
  expiresAt: z.iso.datetime(),
  typedData: z.object({
    domain: z.object({
      chainId: z.number().optional(),
      name: z.string().optional(),
      salt: z
        .custom<`0x${string}`>(
          (v) => typeof v === 'string' && /^0x[0-9a-fA-F]*$/.test(v),
        )
        .optional(),
      verifyingContract: EvmAddressSchema.optional(),
      version: z.string().optional(),
    }),
    types: z.record(
      z.string(),
      z.array(z.object({ name: z.string(), type: z.string() })),
    ),
    primaryType: z.string(),
    message: z.record(z.string(), z.unknown()),
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
