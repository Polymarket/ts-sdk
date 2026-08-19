import { type EvmAddress, EvmAddressSchema } from '@polymarket/bindings';
import { WalletType } from '@polymarket/bindings/gamma';
import {
  type RelayerAuthorizeSessionSignerRequest,
  RelayerAuthorizeSessionSignerResponseSchema,
  type RelayerSessionSignerScope,
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
import { isDepositWalletOwner } from '../wallet';
import { completeWith } from '../workflow';
import {
  buildDepositWalletExecuteRequest,
  GaslessTransactionHandle,
} from './gasless';

/** Venue authorization attached to a session-key grant. */
export enum SessionKeyScope {
  /** Reserved service value. It cannot be requested. */
  UNSPECIFIED = 0,
  /** All current and future venues. Cannot be combined with other scopes. */
  ALL = 1,
  /** Central limit order book trading. */
  CLOB = 2,
  /** Request-for-quote trading. */
  RFQ = 3,
  /** Combos request-for-quote trading. */
  COMBOSRFQ = 4,
  /** Block trading. */
  BLOCKTRADE = 5,
}

/** Scope values that may appear in a request or active grant. */
export type SessionKeyGrantScope =
  | SessionKeyScope.ALL
  | SessionKeyScope.CLOB
  | SessionKeyScope.RFQ
  | SessionKeyScope.COMBOSRFQ
  | SessionKeyScope.BLOCKTRADE;

/** Status of a usable session-key grant. */
export enum SessionKeyStatus {
  /** The session signer may use its granted scopes until expiry or revocation. */
  ACTIVE = 'ACTIVE',
}

/** Public metadata for a session-key grant. Never contains key material. */
export type ActiveSessionKey = {
  /** Public EVM address of the externally managed session signer. */
  address: EvmAddress;
  /** Venue scopes granted to the signer in canonical enum order. */
  scopes: SessionKeyGrantScope[];
  /** Absolute expiry as whole Unix seconds. */
  validUntil: number;
  /** Current normalized grant status. */
  status: SessionKeyStatus.ACTIVE;
};

export type AuthorizeSessionKeyResult = {
  /** Durable operation accepted by the authorization service. */
  operationId: string;
  /** Grant confirmed by the temporary transaction-readiness check. */
  sessionKey: ActiveSessionKey;
};

export type AuthorizeSessionKeyParams = {
  /** Public EVM address of the externally managed session signer. */
  address: string;
  /** Stable key for safely retrying the same logical authorization. */
  idempotencyKey?: string;
  /** Non-empty requested scopes. `ALL` must appear alone. */
  scopes: SessionKeyGrantScope[];
  /** Absolute expiry as whole future Unix seconds. */
  validUntil: number;
};

const SessionKeyGrantScopeSchema: z.ZodType<SessionKeyGrantScope> = z.union([
  z.literal(SessionKeyScope.ALL),
  z.literal(SessionKeyScope.CLOB),
  z.literal(SessionKeyScope.RFQ),
  z.literal(SessionKeyScope.COMBOSRFQ),
  z.literal(SessionKeyScope.BLOCKTRADE),
]);

type NormalizedAuthorizeSessionKeyParams = {
  address: EvmAddress;
  idempotencyKey?: string;
  scopes: SessionKeyGrantScope[];
  validUntil: number;
};

function createAuthorizeSessionKeyParamsSchema(wallet: EvmAddress) {
  return z
    .object({
      address: EvmAddressSchema,
      idempotencyKey: z.string().trim().min(1).optional(),
      scopes: z.array(SessionKeyGrantScopeSchema).min(1),
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
      (value): NormalizedAuthorizeSessionKeyParams => ({
        ...value,
        address: expectEvmAddress(value.address.toLowerCase()),
        scopes: [...new Set(value.scopes)].sort((left, right) => left - right),
      }),
    );
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
 * This temporary implementation resolves after the submitted transaction is
 * confirmed. Authoritative Wallet Registry readiness polling will replace
 * this check once active session-key listing is available.
 *
 * @example
 * ```ts
 * const authorization = await authorizeSessionKey(client)({
 *   address: sessionAddress,
 *   scopes: [SessionKeyScope.CLOB],
 *   validUntil: Math.floor(Date.now() / 1_000) + 15 * 60,
 * });
 * ```
 *
 * @throws {@link AuthorizeSessionKeyError}
 * Thrown on failure.
 */
export function authorizeSessionKey(
  client: BaseSecureClient,
): (params: AuthorizeSessionKeyParams) => Promise<AuthorizeSessionKeyResult> {
  return async function authorize(params) {
    assertOwnerDepositWallet(client);

    const request = parseUserInput(
      params,
      createAuthorizeSessionKeyParamsSchema(client.account.wallet),
    );
    const signedBatch = await completeWith(client.signer)(
      buildDepositWalletExecuteRequest(client, [
        authorizeSessionSignerCall(
          client.account.wallet,
          request.address,
          BigInt(request.validUntil),
        ),
      ]),
    );
    const payload: RelayerAuthorizeSessionSignerRequest = {
      deadline: signedBatch.depositWalletParams.deadline,
      nonce: signedBatch.nonce,
      scopes: request.scopes.map(toRelayerSessionSignerScope),
      sessionSignerAddress: request.address,
      signature: signedBatch.signature,
      validUntil: `${request.validUntil}`,
      walletAddress: client.account.wallet,
    };
    const response = await unwrap(
      client.relayer
        .post('/v1/session-signers/authorizations', {
          headers: {
            'Idempotency-Key':
              request.idempotencyKey ?? globalThis.crypto.randomUUID(),
          },
          json: payload,
        })
        .andThen(validateWith(RelayerAuthorizeSessionSignerResponseSchema)),
    );

    // TODO(TRA-354): Session-key listing is still pending; poll it for authoritative readiness once available.
    await new GaslessTransactionHandle(client, response).wait();

    return {
      operationId: response.operationId,
      sessionKey: {
        address: request.address,
        scopes: request.scopes,
        status: SessionKeyStatus.ACTIVE,
        validUntil: request.validUntil,
      },
    };
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
  scope: SessionKeyGrantScope,
): RelayerSessionSignerScope {
  switch (scope) {
    case SessionKeyScope.ALL:
      return 'ALL';
    case SessionKeyScope.CLOB:
      return 'CLOB';
    case SessionKeyScope.RFQ:
      return 'RFQ';
    case SessionKeyScope.COMBOSRFQ:
      return 'COMBOSRFQ';
    case SessionKeyScope.BLOCKTRADE:
      return 'BLOCKTRADE';
  }
}
