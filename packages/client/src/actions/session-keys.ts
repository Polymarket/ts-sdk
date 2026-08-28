import {
  type EvmAddress,
  EvmAddressSchema,
  SessionSignerKnownScope as SessionKeyKnownScope,
  type SessionSignerScope as SessionKeyScope,
  SessionSignerScopeSchema,
} from '@polymarket/bindings';
import { ActiveSessionSignersResponseSchema } from '@polymarket/bindings/clob';
import { WalletType } from '@polymarket/bindings/gamma';
import {
  RelayerAuthorizeSessionSignerResponseSchema,
  RelayerRevokeSessionSignerResponseSchema,
} from '@polymarket/bindings/relayer';
import {
  delay,
  expectEvmAddress,
  isSameEvmAddress,
  unwrap,
  ZERO_ADDRESS,
} from '@polymarket/types';
import { z } from 'zod';
import { authorizeSessionSignerCall, revokeSessionSignerCall } from '../abis';
import type { BaseSecureClient } from '../clients';
import {
  CancelledSigningError,
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import { validateWith } from '../response';
import type { TransactionOutcome } from '../types';
import { SignerType } from '../wallet';
import { completeWith } from '../workflow';
import {
  buildDepositWalletExecuteRequest,
  GaslessTransactionHandle,
} from './gasless';
import { assertSessionSignerOperationAccepted } from './session-key-status';

export type { SessionKeyScope };
export { SessionKeyKnownScope };

/**
 * A scoped session key authorized for the Deposit Wallet.
 */
export type SessionKey = {
  /** Public EVM address of the externally managed session signer. */
  address: EvmAddress;
  /** Venue scopes granted to the signer. */
  scopes: SessionKeyScope[];
  /** Absolute expiry as whole Unix seconds. */
  validUntil: number;
};

export type FetchSessionKeysError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchSessionKeysError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches the active session keys authorized for the Deposit Wallet.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const sessionKeys = await fetchSessionKeys(client);
 * ```
 *
 * @throws {@link FetchSessionKeysError}
 * Thrown on failure.
 */
export async function fetchSessionKeys(
  client: BaseSecureClient,
): Promise<SessionKey[]> {
  assertOwnerDepositWallet(client);

  const response = await unwrap(
    client.secureClob
      .get('/v1/user/session-signers')
      .andThen(validateWith(ActiveSessionSignersResponseSchema)),
  );

  if (!isSameEvmAddress(response.wallet, client.account.wallet)) {
    throw new UnexpectedResponseError(
      `Session-key response wallet ${response.wallet} does not match authenticated wallet ${client.account.wallet}`,
    );
  }

  return response.signers.map((sessionSigner) => ({
    address: expectEvmAddress(sessionSigner.address.toLowerCase()),
    scopes: sessionSigner.scopes,
    validUntil: sessionSigner.validUntil,
  }));
}

/** Parameters for authorizing a scoped session key. */
export type AuthorizeSessionKeyRequest = {
  /** Public EVM address of the externally managed session signer. */
  address: string;
  /** Stable key to reuse when retrying the same logical authorization. */
  idempotencyKey?: string;
  /** Requested scopes. Defaults to `ALL`, which must appear alone. */
  scopes?: SessionKeyScope[];
};

type ParsedAuthorizeSessionKeyRequest = {
  address: EvmAddress;
  idempotencyKey?: string;
  scopes: SessionKeyScope[];
};

const DEFAULT_SESSION_KEY_SCOPES = [
  SessionKeyKnownScope.ALL,
] satisfies SessionKeyScope[];
const SESSION_KEY_LIFETIME_SECONDS = 4_315 * 60 * 60;

const AuthorizeSessionKeyRequestSchema = z
  .object({
    address: EvmAddressSchema,
    idempotencyKey: z.string().trim().min(1).optional(),
    scopes: z
      .array(SessionSignerScopeSchema)
      .min(1)
      .default(DEFAULT_SESSION_KEY_SCOPES),
  })
  .superRefine((value, context) => {
    if (isSameEvmAddress(value.address, ZERO_ADDRESS)) {
      context.addIssue({
        code: 'custom',
        message: 'Session key address must not be the zero address.',
        path: ['address'],
      });
    }

    if (
      value.scopes.includes(SessionKeyKnownScope.ALL) &&
      value.scopes.some((scope) => scope !== SessionKeyKnownScope.ALL)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Session key scope ALL cannot be combined with another scope.',
        path: ['scopes'],
      });
    }
  })
  .transform(
    (value): ParsedAuthorizeSessionKeyRequest => ({
      ...value,
      address: expectEvmAddress(value.address.toLowerCase()),
    }),
  ) satisfies z.ZodType<
  ParsedAuthorizeSessionKeyRequest,
  AuthorizeSessionKeyRequest
>;

/** Result of a confirmed session-key authorization. */
export type AuthorizeSessionKeyResult = {
  /** Session-key metadata associated with the confirmed authorization. */
  sessionKey: SessionKey;
  /** Confirmed transaction that applied the authorization. */
  transaction: TransactionOutcome;
};

export type AuthorizeSessionKeyError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TimeoutError
  | TransactionFailedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const AuthorizeSessionKeyError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Authorizes an externally managed signer for selected venues.
 *
 * The SDK receives only the public address. The application remains
 * responsible for generating, storing, and protecting the private key.
 * When scopes are omitted, authorization defaults to `ALL`.
 * The authorization expires 180 days after it is created.
 * Requires builder API-key authentication.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * Resolves after the submitted transaction is confirmed and the session key
 * appears in the active session-key list.
 *
 * @example
 * ```ts
 * const authorization = await authorizeSessionKey(client, {
 *   address: sessionAddress,
 * });
 * ```
 *
 * @throws {@link AuthorizeSessionKeyError}
 * Thrown on failure.
 */
export async function authorizeSessionKey(
  client: BaseSecureClient,
  request: AuthorizeSessionKeyRequest,
): Promise<AuthorizeSessionKeyResult> {
  assertOwnerDepositWallet(client);

  if (!client.hasBuilderApiKey) {
    throw new UserInputError(
      'Session-key authorization requires builder API-key authentication.',
    );
  }

  const parsedRequest = parseUserInput(
    request,
    AuthorizeSessionKeyRequestSchema,
  );
  const validUntil =
    Math.floor(Date.now() / 1_000) + SESSION_KEY_LIFETIME_SECONDS;
  const signedBatch = await completeWith(client.signer)(
    buildDepositWalletExecuteRequest(client, [
      authorizeSessionSignerCall(
        client.account.wallet,
        parsedRequest.address,
        BigInt(validUntil),
      ),
    ]),
  );
  const payload = {
    deadline: signedBatch.depositWalletParams.deadline,
    nonce: signedBatch.nonce,
    scopes: parsedRequest.scopes,
    sessionSignerAddress: parsedRequest.address,
    signature: signedBatch.signature,
    validUntil: `${validUntil}`,
    walletAddress: client.account.wallet,
  };
  const response = await unwrap(
    client.relayer
      .post('/v1/session-signers/authorizations', {
        headers: {
          'Idempotency-Key':
            parsedRequest.idempotencyKey ?? globalThis.crypto.randomUUID(),
        },
        json: payload,
      })
      .andThen(validateWith(RelayerAuthorizeSessionSignerResponseSchema)),
  );
  assertSessionSignerOperationAccepted({
    kind: 'authorization',
    status: response.status,
  });

  const transaction = await new GaslessTransactionHandle(
    client,
    response,
  ).wait();

  const sessionKey = await waitForAuthorizedSessionKey(client, {
    address: parsedRequest.address,
    scopes: parsedRequest.scopes,
    validUntil,
  });

  return {
    sessionKey,
    transaction,
  };
}

/** Parameters for revoking a session key. */
export type RevokeSessionKeyRequest = {
  /** Public EVM address of the session signer to revoke. */
  address: string;
  /** Stable key to reuse when retrying the same signed revocation. */
  idempotencyKey?: string;
};

type ParsedRevokeSessionKeyRequest = {
  address: EvmAddress;
  idempotencyKey?: string;
};

const RevokeSessionKeyRequestSchema = z
  .object({
    address: EvmAddressSchema,
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (isSameEvmAddress(value.address, ZERO_ADDRESS)) {
      context.addIssue({
        code: 'custom',
        message: 'Session key address must not be the zero address.',
        path: ['address'],
      });
    }
  })
  .transform(
    (value): ParsedRevokeSessionKeyRequest => ({
      ...value,
      address: expectEvmAddress(value.address.toLowerCase()),
    }),
  ) satisfies z.ZodType<ParsedRevokeSessionKeyRequest, RevokeSessionKeyRequest>;

/** Result of a confirmed session-key revocation. */
export type RevokeSessionKeyResult = {
  /** Confirmed transaction that applied the revocation. */
  transaction: TransactionOutcome;
};

export type RevokeSessionKeyError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TimeoutError
  | TransactionFailedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const RevokeSessionKeyError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Revokes a session key authorized for the Deposit Wallet.
 *
 * Revocation may take several minutes while existing activity is canceled and
 * the on-chain revocation is confirmed.
 * Requires API-key authentication that supports gasless transactions.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const revocation = await revokeSessionKey(client, {
 *   address: sessionAddress,
 * });
 * ```
 *
 * @throws {@link RevokeSessionKeyError}
 * Thrown on failure.
 */
export async function revokeSessionKey(
  client: BaseSecureClient,
  request: RevokeSessionKeyRequest,
): Promise<RevokeSessionKeyResult> {
  assertOwnerDepositWallet(client);

  if (!client.supportsGasless) {
    throw new UserInputError(
      'Session-key revocation requires API-key authentication that supports gasless transactions.',
    );
  }

  const parsedRequest = parseUserInput(request, RevokeSessionKeyRequestSchema);
  const signedBatch = await completeWith(client.signer)(
    buildDepositWalletExecuteRequest(client, [
      revokeSessionSignerCall(client.account.wallet, parsedRequest.address),
    ]),
  );
  const payload = {
    deadline: signedBatch.depositWalletParams.deadline,
    nonce: signedBatch.nonce,
    sessionSignerAddress: parsedRequest.address,
    signature: signedBatch.signature,
    walletAddress: client.account.wallet,
  };
  const response = await unwrap(
    client.relayer
      .post('/v1/session-signers/revocations', {
        headers: {
          'Idempotency-Key':
            parsedRequest.idempotencyKey ?? globalThis.crypto.randomUUID(),
        },
        json: payload,
      })
      .andThen(validateWith(RelayerRevokeSessionSignerResponseSchema)),
  );
  assertSessionSignerOperationAccepted({
    kind: 'revocation',
    status: response.status,
  });
  const transaction = await new GaslessTransactionHandle(client, {
    transactionHash: null,
    transactionId: response.transactionId,
  }).wait();

  return {
    transaction,
  };
}

async function waitForAuthorizedSessionKey(
  client: BaseSecureClient,
  expected: SessionKey,
): Promise<SessionKey> {
  // This temporary readiness check deliberately reuses the relayer transaction
  // polling limits instead of introducing session-key-specific configuration.
  for (
    let pollCount = 0;
    pollCount < client.environment.relayerMaxPolls;
    pollCount += 1
  ) {
    const sessionKey = (await fetchSessionKeys(client)).find(
      (candidate) =>
        isSameEvmAddress(candidate.address, expected.address) &&
        candidate.validUntil === expected.validUntil &&
        haveSameScopes(candidate.scopes, expected.scopes),
    );

    if (sessionKey !== undefined) {
      return sessionKey;
    }

    await delay(client.environment.relayerPollFrequencyMs);
  }

  throw new TimeoutError(
    `Timed out waiting for session key ${expected.address} to become active`,
  );
}

function haveSameScopes(
  left: SessionKeyScope[],
  right: SessionKeyScope[],
): boolean {
  const rightScopes = new Set(right);

  return (
    new Set(left).size === rightScopes.size &&
    left.every((scope) => rightScopes.has(scope))
  );
}

function assertOwnerDepositWallet(client: BaseSecureClient): void {
  if (client.account.walletType !== WalletType.DEPOSIT_WALLET) {
    throw new UserInputError(
      'Session keys can only be managed for a Deposit Wallet.',
    );
  }

  if (client.account.signerType !== SignerType.OWNER) {
    throw new UserInputError(
      'Session keys can only be managed by the Deposit Wallet owner.',
    );
  }
}
