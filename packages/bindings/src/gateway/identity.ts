import { type EvmAddress, expectHexString } from '@polymarket/types';
import { z } from 'zod';
import {
  type SignatureType,
  SignatureTypeSchema,
} from '../clob/signature-type';
import { ApiKeySchema, EvmAddressSchema } from '../shared';

/** The kind of platform API key used by an application. */
export enum PlatformKeyType {
  Publishable = 'publishable',
  Secret = 'secret',
}

/** The identity of the configured platform API key. */
export type PlatformKeyIdentity = {
  keyId: string;
  keyType: PlatformKeyType;
};

export const PlatformKeyIdentitySchema = z.strictObject({
  keyId: z.string().min(1),
  keyType: z.enum(PlatformKeyType),
}) satisfies z.ZodType<PlatformKeyIdentity>;

/** The signer and optional wallet authorized by a predictions session. */
export type PredictionsIdentity = {
  signer: EvmAddress;
  apiKeyId?: string;
  wallet?: EvmAddress;
  signatureType?: SignatureType;
};

export const PredictionsIdentitySchema = z
  .strictObject({
    signer: EvmAddressSchema,
    apiKeyId: z.uuid().optional(),
    wallet: EvmAddressSchema.optional(),
    signatureType: SignatureTypeSchema.optional(),
  })
  .refine(
    (identity) =>
      (identity.wallet === undefined) ===
      (identity.signatureType === undefined),
    'Wallet and signature type must be present together',
  ) satisfies z.ZodType<PredictionsIdentity>;

const Bytes32Schema = z
  .string()
  .regex(/^0x[\da-fA-F]{64}$/)
  .transform((value) => expectHexString(value));
const EpochSecondsStringSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .refine(
    (value) => Number(value) <= Math.floor(Number.MAX_SAFE_INTEGER / 1000),
    'Timestamp exceeds the supported range',
  );

function field<const TName extends string, const TType extends string>(
  name: TName,
  type: TType,
) {
  return z.strictObject({ name: z.literal(name), type: z.literal(type) });
}

/** The fixed EIP-712 payload for proving signer ownership. */
export const SignerOwnershipTypedDataSchema = z.strictObject({
  primaryType: z.literal('SignerOwnership'),
  types: z.strictObject({
    EIP712Domain: z.tuple([
      field('name', 'string'),
      field('version', 'string'),
      field('chainId', 'uint256'),
      field('salt', 'bytes32'),
    ]),
    SignerOwnership: z.tuple([
      field('signer', 'address'),
      field('nonce', 'bytes32'),
      field('issuedAt', 'uint256'),
      field('expiresAt', 'uint256'),
    ]),
  }),
  domain: z.strictObject({
    name: z.literal('Polymarket'),
    version: z.literal('1'),
    chainId: z.number().int().positive(),
    salt: Bytes32Schema,
  }),
  message: z.strictObject({
    signer: EvmAddressSchema,
    nonce: Bytes32Schema,
    issuedAt: EpochSecondsStringSchema,
    expiresAt: EpochSecondsStringSchema,
  }),
});

export const SignerOwnershipChallengeSchema = z
  .object({
    challengeId: z.uuid(),
    typedData: SignerOwnershipTypedDataSchema,
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .refine((challenge) => {
    const { issuedAt, expiresAt } = challenge.typedData.message;
    return (
      Number(expiresAt) > Number(issuedAt) &&
      Date.parse(challenge.expiresAt) === Number(expiresAt) * 1000
    );
  }, 'Challenge timestamps do not agree');

export type SignerOwnershipChallenge = z.infer<
  typeof SignerOwnershipChallengeSchema
>;

/** Credential response from identity login or refresh. Lifetimes are seconds. */
export const PredictionsTokensSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z
    .number()
    .int()
    .positive()
    .max(Math.floor(Number.MAX_SAFE_INTEGER / 1000)),
  refreshToken: z.string().min(1),
  refreshExpiresIn: z
    .number()
    .int()
    .nonnegative()
    .max(Math.floor(Number.MAX_SAFE_INTEGER / 1000)),
});

export type PredictionsTokens = z.infer<typeof PredictionsTokensSchema>;

/** Trading credentials returned by the authentication exchange. */
export const GatewayTradingCredentialsSchema = z
  .object({
    type: z.literal('L2_CREDENTIALS'),
    key: ApiKeySchema,
    secret: z.string(),
    passphrase: z.string(),
  })
  .transform(({ key, secret, passphrase }) => ({ key, secret, passphrase }));
