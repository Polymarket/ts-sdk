import { type EvmAddress, EvmAddressSchema } from '@polymarket/bindings';
import { WalletType } from '@polymarket/bindings/gamma';
import {
  type RelayerAuthorizeSessionSignerRequest,
  RelayerAuthorizeSessionSignerResponseSchema,
  RelayerSessionSignerScope,
} from '@polymarket/bindings/relayer';
import {
  expectEvmAddress,
  isSameEvmAddress,
  unwrap,
  ZERO_ADDRESS,
} from '@polymarket/types';
import { z } from 'zod';
import { authorizeSessionSignerCall } from '../abis';
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

/** Venue authorization attached to a session-key grant. */
export enum SessionKeyScope {
  /** All current and future venues. Cannot be combined with other scopes. */
  ALL = 'ALL',
  /** Central limit order book trading. */
  CLOB = 'CLOB',
  /** Combos request-for-quote trading. */
  COMBOSRFQ = 'COMBOSRFQ',
  /** Block trading. */
  BLOCKTRADE = 'BLOCKTRADE',
}

/**
 * Public metadata for a confirmed session-key authorization.
 *
 * @remarks
 * This reflects the validated request after transaction confirmation. It does
 * not report a separate discovery or readiness status.
 */
export type AuthorizedSessionKey = {
  /** Public EVM address of the externally managed session signer. */
  address: EvmAddress;
  /** Venue scopes granted to the signer in canonical enum order. */
  scopes: SessionKeyScope[];
  /** Absolute expiry as whole Unix seconds. */
  validUntil: number;
};

/** Result of a confirmed session-key authorization. */
export type AuthorizeSessionKeyResult = {
  /** Identifier assigned to the accepted authorization operation. */
  operationId: string;
  /** Session-key metadata associated with the confirmed authorization. */
  sessionKey: AuthorizedSessionKey;
  /** Confirmed transaction that applied the authorization. */
  transaction: TransactionOutcome;
};

/** Parameters for authorizing a scoped session key. */
export type AuthorizeSessionKeyRequest = {
  /** Public EVM address of the externally managed session signer. */
  address: string;
  /** Stable key to reuse when retrying the same logical authorization. */
  idempotencyKey?: string;
  /** Non-empty requested scopes. `ALL` must appear alone. */
  scopes: SessionKeyScope[];
  /** Absolute expiry as whole future Unix seconds. */
  validUntil: number;
};

const SessionKeyScopeSchema = z.enum(
  SessionKeyScope,
) satisfies z.ZodType<SessionKeyScope>;

const SESSION_KEY_SCOPE_ORDER = [
  SessionKeyScope.ALL,
  SessionKeyScope.CLOB,
  SessionKeyScope.COMBOSRFQ,
  SessionKeyScope.BLOCKTRADE,
] as const;

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
      scopes: z.array(SessionKeyScopeSchema).min(1),
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
        value.scopes.includes(SessionKeyScope.ALL) &&
        value.scopes.some((scope) => scope !== SessionKeyScope.ALL)
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
    .transform(
      (value): ParsedAuthorizeSessionKeyRequest => ({
        ...value,
        address: expectEvmAddress(value.address.toLowerCase()),
        scopes: SESSION_KEY_SCOPE_ORDER.filter((scope) =>
          value.scopes.includes(scope),
        ),
      }),
    );

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

/**
 * Authorizes an externally managed signer for selected venues.
 *
 * The SDK receives only the public address. The application remains
 * responsible for generating, storing, and protecting the private key.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * This temporary implementation resolves after the submitted transaction is
 * confirmed. Session-key listing is not yet available, so the SDK cannot
 * perform a separate discovery and readiness check.
 *
 * @example
 * ```ts
 * const authorization = await authorizeSessionKey(client, {
 *   address: sessionAddress,
 *   scopes: [SessionKeyScope.CLOB],
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
    scopes: parsedRequest.scopes.map(toRelayerSessionSignerScope),
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

  // TODO(TRA-354): Session-key listing is still pending; poll it for authoritative readiness once available.
  const transaction = await new GaslessTransactionHandle(
    client,
    response,
  ).wait();

  return {
    operationId: response.operationId,
    sessionKey: {
      address: parsedRequest.address,
      scopes: parsedRequest.scopes,
      validUntil: parsedRequest.validUntil,
    },
    transaction,
  };
}

function assertOwnerDepositWallet(client: BaseSecureClient): void {
  if (client.account.walletType !== WalletType.DEPOSIT_WALLET) {
    throw new UserInputError(
      'Session keys can only be authorized for a Deposit Wallet.',
    );
  }

  if (!isDepositWalletOwner(client.environment, client.account)) {
    throw new UserInputError(
      'Session keys can only be authorized by the Deposit Wallet owner.',
    );
  }
}

function toRelayerSessionSignerScope(
  scope: SessionKeyScope,
): RelayerSessionSignerScope {
  switch (scope) {
    case SessionKeyScope.ALL:
      return RelayerSessionSignerScope.ALL;
    case SessionKeyScope.CLOB:
      return RelayerSessionSignerScope.CLOB;
    case SessionKeyScope.COMBOSRFQ:
      return RelayerSessionSignerScope.COMBOSRFQ;
    case SessionKeyScope.BLOCKTRADE:
      return RelayerSessionSignerScope.BLOCKTRADE;
  }
}
