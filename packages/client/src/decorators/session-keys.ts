import {
  type AuthorizeSessionKeyRequest,
  type AuthorizeSessionKeyResult,
  authorizeSessionKey,
  fetchSessionKeys,
  type RevokeSessionKeyRequest,
  type RevokeSessionKeyResult,
  revokeSessionKey,
  type SessionKey,
} from '../actions';
import type { BaseSecureClient } from '../clients';

export type SessionKeyActions = {
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
   * Resolves after the submitted transaction is confirmed and the session key
   * appears in the active session-key list.
   *
   * @example
   * ```ts
   * const authorization = await client.authorizeSessionKey({
   *   address: sessionAddress,
   * });
   * ```
   *
   * @throws {@link AuthorizeSessionKeyError}
   * Thrown on failure.
   */
  authorizeSessionKey(
    request: AuthorizeSessionKeyRequest,
  ): Promise<AuthorizeSessionKeyResult>;

  /**
   * Fetches the active session keys authorized for the Deposit Wallet.
   *
   * @example
   * ```ts
   * const sessionKeys = await client.fetchSessionKeys();
   * ```
   *
   * @throws {@link FetchSessionKeysError}
   * Thrown on failure.
   */
  fetchSessionKeys(): Promise<SessionKey[]>;

  /**
   * Revokes a session key authorized for the Deposit Wallet.
   *
   * Revocation may take several minutes while existing activity is canceled and
   * the on-chain revocation is confirmed.
   * Requires API-key authentication that supports gasless transactions.
   *
   * @example
   * ```ts
   * const revocation = await client.revokeSessionKey({
   *   address: sessionAddress,
   * });
   * ```
   *
   * @throws {@link RevokeSessionKeyError}
   * Thrown on failure.
   */
  revokeSessionKey(
    request: RevokeSessionKeyRequest,
  ): Promise<RevokeSessionKeyResult>;
};

export function sessionKeyActions(client: BaseSecureClient): SessionKeyActions {
  return {
    authorizeSessionKey: authorizeSessionKey.bind(null, client),
    fetchSessionKeys: fetchSessionKeys.bind(null, client),
    revokeSessionKey: revokeSessionKey.bind(null, client),
  };
}

export type {
  AuthorizeSessionKeyRequest,
  AuthorizeSessionKeyResult,
  RevokeSessionKeyRequest,
  RevokeSessionKeyResult,
  SessionKey,
  SessionKeyScope,
} from '../actions';
export {
  AuthorizeSessionKeyError,
  FetchSessionKeysError,
  RevokeSessionKeyError,
  SessionKeyKnownScope,
} from '../actions';
