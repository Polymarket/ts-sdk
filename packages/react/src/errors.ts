import { PolymarketError } from '@polymarket/types';

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
