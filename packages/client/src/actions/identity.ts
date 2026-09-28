import {
  type PlatformKeyIdentity,
  PlatformKeyIdentitySchema,
} from '@polymarket/bindings/gateway';
import { unwrap } from '@polymarket/types';
import type { BaseClient, BaseSecureClient } from '../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
} from '../errors';
import type { PredictionsSession } from '../predictions-session';
import { validateWith } from '../response';

export {
  type PlatformKeyIdentity,
  PlatformKeyType,
  type PredictionsIdentity,
} from '@polymarket/bindings/gateway';
export {
  FetchPredictionsIdentityError,
  LogoutPredictionsSessionError,
  OpenPredictionsSessionError,
  type PredictionsSession,
  PredictionsSessionClosedError,
} from '../predictions-session';

export type FetchIdentityError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError;
export const FetchIdentityError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
);

/**
 * Fetches the configured platform API key's identity without opening a session.
 *
 * @throws {@link FetchIdentityError}
 * Thrown when the key is rejected or its identity cannot be read.
 */
export function fetchIdentity(
  client: BaseClient,
): Promise<PlatformKeyIdentity> {
  return unwrap(
    client.gateway
      .get('/next/me', { timeout: 10_000 })
      .andThen(validateWith(PlatformKeyIdentitySchema)),
  );
}

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
export function openPredictionsSession(
  client: BaseSecureClient,
): Promise<PredictionsSession> {
  return client.predictionsSessions.open();
}
