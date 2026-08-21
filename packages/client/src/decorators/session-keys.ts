import {
  type AuthorizeSessionKeyRequest,
  type AuthorizeSessionKeyResult,
  authorizeSessionKey,
} from '../actions';
import type { BaseSecureClient } from '../clients';

export type SessionKeyActions = {
  /**
   * Authorizes an externally managed signer for selected venues.
   *
   * The SDK receives only the public address. The application remains
   * responsible for generating, storing, and protecting the private key.
   *
   * @remarks
   * This temporary implementation resolves after the submitted transaction is
   * confirmed. Session-key listing is not yet available, so the SDK cannot
   * perform a separate discovery and readiness check.
   *
   * @example
   * ```ts
   * const authorization = await client.authorizeSessionKey({
   *   address: sessionAddress,
   *   scopes: [SessionKeyKnownScope.CLOB],
   *   validUntil: Math.floor(Date.now() / 1_000) + 15 * 60,
   * });
   * ```
   *
   * @throws {@link AuthorizeSessionKeyError}
   * Thrown on failure.
   */
  authorizeSessionKey(
    request: AuthorizeSessionKeyRequest,
  ): Promise<AuthorizeSessionKeyResult>;
};

export function sessionKeyActions(client: BaseSecureClient): SessionKeyActions {
  return {
    authorizeSessionKey: authorizeSessionKey.bind(null, client),
  };
}

export type {
  AuthorizedSessionKey,
  AuthorizeSessionKeyRequest,
  AuthorizeSessionKeyResult,
  SessionKeyScope,
} from '../actions';
export { AuthorizeSessionKeyError, SessionKeyKnownScope } from '../actions';
