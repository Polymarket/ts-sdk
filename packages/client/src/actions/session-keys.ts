import { type EvmAddress, EvmAddressSchema } from '@polymarket/bindings';
import { ActiveSessionSignersResponseSchema } from '@polymarket/bindings/clob';
import { WalletType } from '@polymarket/bindings/gamma';
import {
  type RelayerAuthorizeSessionSignerRequest,
  RelayerAuthorizeSessionSignerResponseSchema,
  type RelayerRevokeSessionSignerRequest,
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
import { isDepositWalletOwner } from '../wallet';
import { completeWith } from '../workflow';
import {
  buildDepositWalletExecuteRequest,
  GaslessTransactionHandle,
} from './gasless';

/**
 * Known venue authorizations attached to session-key grants.
 *
 * Session-key authorization accepts newer scopes as plain strings; see
 * {@link SessionKeyScope}.
 */
export enum SessionKeyKnownScope {
  /** All current and future venues. Cannot be combined with other scopes. */
  ALL = 'ALL',
  /** Central limit order book trading. */
  CLOB = 'CLOB',
  /** Combos request-for-quote trading. */
  COMBOSRFQ = 'COMBOSRFQ',
}

/**
 * A session-key scope. Known scopes are enumerated in
 * {@link SessionKeyKnownScope}; newly introduced scopes remain usable before
 * an SDK release enumerates them.
 */
export type SessionKeyScope = SessionKeyKnownScope | (string & {});

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

/** Result of a confirmed session-key authorization. */
export type AuthorizeSessionKeyResult = {
  /** Identifier assigned to the accepted authorization operation. */
  operationId: string;
  /** Session-key metadata associated with the confirmed authorization. */
  sessionKey: SessionKey;
  /** Confirmed transaction that applied the authorization. */
  transaction: TransactionOutcome;
};

/** Parameters for authorizing a scoped session key. */
export type AuthorizeSessionKeyRequest = {
  /** Public EVM address of the externally managed session signer. */
  address: string;
  /** Stable key to reuse when retrying the same logical authorization. */
  idempotencyKey?: string;
  /** Requested scopes. Defaults to `ALL`, which must appear alone. */
  scopes?: SessionKeyScope[];
  /** Absolute expiry as whole future Unix seconds. */
  validUntil: number;
};

const SessionKeyScopeSchema = z
  .string()
  .min(1)
  .transform((value): SessionKeyScope => value);

const SESSION_KEY_KNOWN_SCOPE_ORDER = [
  SessionKeyKnownScope.ALL,
  SessionKeyKnownScope.CLOB,
  SessionKeyKnownScope.COMBOSRFQ,
] as const;

const DEFAULT_SESSION_KEY_SCOPES = [SessionKeyKnownScope.ALL] as const;

type ParsedAuthorizeSessionKeyRequest = {
  address: EvmAddress;
  idempotencyKey?: string;
  scopes: SessionKeyScope[];
  validUntil: number;
};

function createAuthorizeSessionKeyRequestSchema(wallet: EvmAddress) {
  const schema = z
    .object({
      address: EvmAddressSchema,
      idempotencyKey: z.string().trim().min(1).optional(),
      scopes: z
        .array(SessionKeyScopeSchema)
        .min(1)
        .optional()
        .transform(
          (scopes): SessionKeyScope[] =>
            scopes ?? [...DEFAULT_SESSION_KEY_SCOPES],
        ),
      validUntil: z.number().int(),
    })
    .superRefine((value, context) => {
      if (isSameEvmAddress(value.address, ZERO_ADDRESS)) {
        context.addIssue({
          code: 'custom',
          message: 'Session key address must not be the zero address.',
          path: ['address'],
        });
      }

      if (isSameEvmAddress(value.address, wallet)) {
        context.addIssue({
          code: 'custom',
          message: 'Session key address must differ from the Deposit Wallet.',
          path: ['address'],
        });
      }

      if (
        value.scopes.includes(SessionKeyKnownScope.ALL) &&
        value.scopes.some((scope) => scope !== SessionKeyKnownScope.ALL)
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Session key scope ALL cannot be combined with another scope.',
          path: ['scopes'],
        });
      }

      if (value.validUntil <= Math.floor(Date.now() / 1_000)) {
        context.addIssue({
          code: 'custom',
          message: 'Session key expiry must be a future Unix timestamp.',
          path: ['validUntil'],
        });
      }
    })
    .transform((value): ParsedAuthorizeSessionKeyRequest => {
      const requestedScopes = new Set(value.scopes);

      return {
        ...value,
        address: expectEvmAddress(value.address.toLowerCase()),
        scopes: [
          ...SESSION_KEY_KNOWN_SCOPE_ORDER.filter((scope) =>
            requestedScopes.delete(scope),
          ),
          ...requestedScopes,
        ],
      };
    });

  return schema satisfies z.ZodType<
    ParsedAuthorizeSessionKeyRequest,
    AuthorizeSessionKeyRequest
  >;
}

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
    scopes: sessionSigner.scopes.map((scope): SessionKeyScope => scope),
    validUntil: sessionSigner.validUntil,
  }));
}

/**
 * Authorizes an externally managed signer for selected venues.
 *
 * The SDK receives only the public address. The application remains
 * responsible for generating, storing, and protecting the private key.
 * When scopes are omitted, authorization defaults to `ALL`.
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
 *   validUntil: Math.floor(Date.now() / 1_000) + 15 * 60,
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

  const parsedRequest = parseUserInput(
    request,
    createAuthorizeSessionKeyRequestSchema(client.account.wallet),
  );
  const signedBatch = await completeWith(client.signer)(
    buildDepositWalletExecuteRequest(client, [
      authorizeSessionSignerCall(
        client.account.wallet,
        parsedRequest.address,
        BigInt(parsedRequest.validUntil),
      ),
    ]),
  );
  const payload: RelayerAuthorizeSessionSignerRequest = {
    deadline: signedBatch.depositWalletParams.deadline,
    nonce: signedBatch.nonce,
    scopes: parsedRequest.scopes,
    sessionSignerAddress: parsedRequest.address,
    signature: signedBatch.signature,
    validUntil: `${parsedRequest.validUntil}`,
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

  const transaction = await new GaslessTransactionHandle(
    client,
    response,
  ).wait();

  const sessionKey = await waitForAuthorizedSessionKey(client, {
    address: parsedRequest.address,
    scopes: parsedRequest.scopes,
    validUntil: parsedRequest.validUntil,
  });

  return {
    operationId: response.operationId,
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

function createRevokeSessionKeyRequestSchema(wallet: EvmAddress) {
  const schema = z
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

      if (isSameEvmAddress(value.address, wallet)) {
        context.addIssue({
          code: 'custom',
          message: 'Session key address must differ from the Deposit Wallet.',
          path: ['address'],
        });
      }
    })
    .transform(
      (value): ParsedRevokeSessionKeyRequest => ({
        ...value,
        address: expectEvmAddress(value.address.toLowerCase()),
      }),
    );

  return schema satisfies z.ZodType<
    ParsedRevokeSessionKeyRequest,
    RevokeSessionKeyRequest
  >;
}

/** Result of a confirmed session-key revocation. */
export type RevokeSessionKeyResult = {
  /** Identifier assigned to the accepted revocation operation. */
  operationId: string;
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

  const parsedRequest = parseUserInput(
    request,
    createRevokeSessionKeyRequestSchema(client.account.wallet),
  );
  const signedBatch = await completeWith(client.signer)(
    buildDepositWalletExecuteRequest(client, [
      revokeSessionSignerCall(client.account.wallet, parsedRequest.address),
    ]),
  );
  const payload: RelayerRevokeSessionSignerRequest = {
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
  const transaction = await new GaslessTransactionHandle(client, {
    transactionHash: null,
    transactionId: response.transactionId,
  }).wait();

  return {
    operationId: response.operationId,
    transaction,
  };
}

async function waitForAuthorizedSessionKey(
  client: BaseSecureClient,
  expected: SessionKey,
): Promise<SessionKey> {
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
  return (
    left.length === right.length && left.every((scope) => right.includes(scope))
  );
}

function assertOwnerDepositWallet(client: BaseSecureClient): void {
  if (client.account.walletType !== WalletType.DEPOSIT_WALLET) {
    throw new UserInputError(
      'Session keys can only be managed for a Deposit Wallet.',
    );
  }

  if (!isDepositWalletOwner(client.environment, client.account)) {
    throw new UserInputError(
      'Session keys can only be managed by the Deposit Wallet owner.',
    );
  }
}
