import {
  EvmAddressSchema,
  OwnershipChallengeSchema,
  TokenResponseSchema,
} from '@polymarket/bindings';
import { z } from 'zod';
import type { BasePublicClient } from '../clients';
import {
  type BearerSessionCredentials,
  L2CredentialsSchema,
  savedBearerCredentials,
} from '../credentials';
import {
  CancelledSigningError,
  makeErrorGuard,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { buildHmacSignature } from '../hmac';
import { parseUserInput } from '../input';
import type { Signer } from '../types';

export type LoginRequest = {
  signer: Signer;
  wallet?: string;
  verificationToken?: string;
  nonce?: number;
};
export const AuthenticationInputSchema = z.object({
  wallet: EvmAddressSchema.optional(),
  verificationToken: z.string().min(1).max(2048).optional(),
  nonce: z.number().int().min(0).max(4294967295).optional(),
});
export type LoginError =
  | CancelledSigningError
  | RateLimitError
  | RequestAbortedError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const LoginError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/** Signs a server-issued ownership challenge and returns the complete session credentials.
 * @throws {@link LoginError} Thrown on authentication failure.
 */
export async function login(
  client: BasePublicClient,
  request: LoginRequest,
): Promise<BearerSessionCredentials> {
  const params = parseUserInput(request, AuthenticationInputSchema);
  let address: string;
  try {
    address = await request.signer.getAddress();
  } catch {
    throw new SigningError('Could not obtain signer address.');
  }
  const signer = parseUserInput(address, EvmAddressSchema);
  const challenge = await client.auth.post('/v1/auth/challenge', {
    json: {
      signer,
      wallet: params.wallet,
      verification_token: params.verificationToken,
      nonce: params.nonce,
    },
    schema: OwnershipChallengeSchema,
    retry: false,
  });
  let signature: string;
  try {
    signature = await request.signer.signTypedData(challenge.typedData);
  } catch (error) {
    if (error instanceof CancelledSigningError)
      throw new CancelledSigningError('Ownership signing was cancelled.');
    throw new SigningError('Could not sign ownership challenge.');
  }
  return client.auth
    .post('/v1/auth/login', {
      json: { ownership: { challenge_id: challenge.challengeId, signature } },
      schema: TokenResponseSchema,
      retry: false,
    })
    .then(savedBearerCredentials);
}

export type MigrateCredentialsRequest = {
  credentials: { key: string; secret: string; passphrase: string };
  signer: string;
  wallet?: string;
  verificationToken?: string;
};
const MigrateCredentialsRequestSchema = AuthenticationInputSchema.omit({
  nonce: true,
}).extend({
  credentials: L2CredentialsSchema,
  signer: EvmAddressSchema,
});
export type MigrateCredentialsError =
  | RateLimitError
  | RequestAbortedError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const MigrateCredentialsError = makeErrorGuard(
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/** Exchanges saved L2 credentials for a bearer session without a new wallet signature.
 * The L2 secret is used locally and is never sent.
 * @throws {@link MigrateCredentialsError} Thrown when migration fails.
 */
export async function migrateCredentials(
  client: BasePublicClient,
  request: MigrateCredentialsRequest,
): Promise<BearerSessionCredentials> {
  const params = parseUserInput(request, MigrateCredentialsRequestSchema);
  const timestamp = Math.floor(Date.now() / 1000);
  let signature: string;
  try {
    // This canonical migration proof does not dispatch a request to the signed path.
    signature = await buildHmacSignature(
      params.credentials.secret,
      timestamp,
      'GET',
      '/auth/api-keys',
    );
  } catch {
    throw new SigningError('Could not prove L2 credential ownership.');
  }
  return client.auth
    .post('/v1/auth/migrate', {
      json: {
        signer: params.signer,
        timestamp: String(timestamp),
        clob_api_key: params.credentials.key,
        clob_passphrase: params.credentials.passphrase,
        clob_signature: signature,
        wallet: params.wallet,
        verification_token: params.verificationToken,
      },
      schema: TokenResponseSchema,
      retry: false,
    })
    .then(savedBearerCredentials);
}
