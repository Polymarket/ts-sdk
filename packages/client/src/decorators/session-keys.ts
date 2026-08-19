import {
  type AuthorizeSessionKeyParams,
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
   * confirmed. Authoritative Wallet Registry readiness polling will replace
   * this check once active session-key listing is available.
   *
   * @example
   * ```ts
   * const authorization = await client.authorizeSessionKey({
   *   address: sessionAddress,
   *   scopes: [SessionKeyScope.CLOB],
   *   validUntil: Math.floor(Date.now() / 1_000) + 15 * 60,
   * });
   * ```
   *
   * @throws {@link AuthorizeSessionKeyError}
   * Thrown on failure.
   */
  authorizeSessionKey(
    params: AuthorizeSessionKeyParams,
  ): Promise<AuthorizeSessionKeyResult>;
};

export function sessionKeyActions(client: BaseSecureClient): SessionKeyActions {
  return {
    authorizeSessionKey: authorizeSessionKey(client),
  };
}

export type {
  ActiveSessionKey,
  AuthorizeSessionKeyParams,
  AuthorizeSessionKeyResult,
  SessionKeyGrantScope,
} from '../actions';
export {
  AuthorizeSessionKeyError,
  SessionKeyScope,
  SessionKeyStatus,
} from '../actions';
