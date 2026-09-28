import type { PlatformKeyIdentity } from '@polymarket/bindings/gateway';
import { fetchIdentity, openPredictionsSession } from '../actions/identity';
import type {
  BaseClient,
  BasePublicClient,
  BaseSecureClient,
} from '../clients';
import type { PredictionsSession } from '../predictions-session';

export {
  FetchIdentityError,
  FetchPredictionsIdentityError,
  LogoutPredictionsSessionError,
  OpenPredictionsSessionError,
  type PlatformKeyIdentity,
  PlatformKeyType,
  type PredictionsIdentity,
  type PredictionsSession,
  PredictionsSessionClosedError,
} from '../actions/identity';

export type PublicIdentityActions = {
  /**
   * Fetches the configured platform API key's identity without opening a session.
   *
   * @throws {@link FetchIdentityError}
   * Thrown when the key is rejected or its identity cannot be read.
   */
  fetchIdentity(): Promise<PlatformKeyIdentity>;
};

export type SecureIdentityActions = PublicIdentityActions & {
  /**
   * Opens a wallet-bound identity session using this client's signer and wallet.
   *
   * Reuses an active session and shares concurrent opening requests. Tokens stay
   * privately in memory. A new session requires a signer ownership signature,
   * separate from the signature used to create trading credentials.
   *
   * @throws {@link OpenPredictionsSessionError}
   * Thrown when signing or session authentication fails.
   */
  openPredictionsSession(): Promise<PredictionsSession>;
};

export function identityActions(
  client: BasePublicClient,
): PublicIdentityActions;
export function identityActions(
  client: BaseSecureClient,
): SecureIdentityActions;
export function identityActions(
  client: BaseClient,
): PublicIdentityActions | SecureIdentityActions {
  if (client.isSecureClient()) {
    return {
      fetchIdentity: fetchIdentity.bind(null, client),
      openPredictionsSession: openPredictionsSession.bind(null, client),
    };
  }
  return { fetchIdentity: fetchIdentity.bind(null, client) };
}
