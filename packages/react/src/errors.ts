import { PolymarketError } from '@polymarket/types';

/**
 * Thrown when a write operation executes while unauthenticated, such as
 * after the session was invalidated but before the UI re-gated the action.
 */
export class UnauthenticatedError extends PolymarketError {
  override name = 'UnauthenticatedError' as const;

  constructor() {
    super('Unauthenticated. Authenticate before performing this operation.');
  }
}

/**
 * Thrown when authentication resolves to an EOA account configuration.
 *
 * @remarks
 * The React SDK supports Deposit Wallet and legacy Safe/Proxy accounts only.
 * EOA trading is allowlist-gated and not supported here; this guarantee keeps
 * the workflow handler surface signature-only.
 */
export class UnsupportedAccountError extends PolymarketError {
  override name = 'UnsupportedAccountError' as const;
}
