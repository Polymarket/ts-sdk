import { RateLimitError, RequestRejectedError } from '../../errors';

/**
 * Extracts the on-chain nonce reported by a submission rejection for a
 * Deposit Wallet batch signed with a mismatched nonce, when present.
 *
 * @internal
 */
export function extractOnChainNonceFromSubmitError(
  error: unknown,
): string | undefined {
  if (!(error instanceof RequestRejectedError) || error.status !== 400) {
    return undefined;
  }

  const match =
    /batch nonce\s+\d+\s+does not match on-chain nonce\s+(\d+)/i.exec(
      error.message,
    );

  return match?.[1];
}

/**
 * Detects transient relayer submission failures (rate limits, wallet-busy
 * races, stale batch nonces) that are safe to retry with a fresh signature.
 *
 * @internal
 */
export function isRetryableGaslessSubmitError(error: unknown): boolean {
  if (error instanceof RateLimitError) {
    return true;
  }

  if (!(error instanceof RequestRejectedError) || error.status !== 400) {
    return false;
  }

  if (
    (/wallet busy/i.test(error.message) &&
      /active action/i.test(error.message)) ||
    /wallet has in-flight action/i.test(error.message)
  ) {
    return true;
  }

  const match =
    /batch nonce\s+(\d+)\s+does not match on-chain nonce\s+(\d+)/i.exec(
      error.message,
    );
  if (match === null) {
    return false;
  }

  const submittedNonce = match[1];
  const onChainNonce = match[2];
  if (submittedNonce === undefined || onChainNonce === undefined) {
    return false;
  }

  return BigInt(submittedNonce) < BigInt(onChainNonce);
}
