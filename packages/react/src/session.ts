import type { ApiKeyCreds, Signer } from '@polymarket/client';
import { expectEvmAddress, InvariantError } from '@polymarket/types';

/**
 * Serializable authenticated-session state.
 *
 * @remarks
 * A `Session` is everything needed to restore an authenticated client without
 * wallet interaction: persist it where your app prefers and pass it back as
 * `initialSession`. Treat it as a secret; it authorizes trading on the
 * account.
 */
export type Session = {
  /** Authenticated signer address. */
  address: string;
  /** Account/funder wallet address. */
  wallet: string;
  /** API credentials for the account. */
  credentials: ApiKeyCreds;
};

/**
 * Creates the signer bound to a session-derived client.
 *
 * @remarks
 * Session clients serve authenticated reads and prepared workflows, which
 * never sign through the client. Wallet operations flow through workflow
 * handlers instead, so every signing method fails with an invariant error.
 *
 * @internal
 */
export function createSessionSigner(session: Session): Signer {
  return {
    getAddress() {
      return Promise.resolve(expectEvmAddress(session.address));
    },
    signMessage() {
      return Promise.reject(sessionSignerViolation('signMessage'));
    },
    signTypedData() {
      return Promise.reject(sessionSignerViolation('signTypedData'));
    },
    sendTransaction() {
      return Promise.reject(sessionSignerViolation('sendTransaction'));
    },
  };
}

/** @internal */
export function sessionSignerViolation(operation: string): InvariantError {
  return new InvariantError(
    `\`${operation}\` is not available on a session client. Drive wallet operations through a workflow handler instead.`,
  );
}
