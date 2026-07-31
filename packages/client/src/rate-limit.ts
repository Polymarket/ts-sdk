/**
 * Per-signer rate-limit state reported by order and cancellation responses.
 *
 * @remarks
 * Fields mirror the `Poly-RateLimit-*` response headers. Every field is
 * populated independently, so any subset can be present depending on how the
 * request was evaluated.
 */
export type RateLimitUpdate = {
  /**
   * Token balance remaining in the applicable rate-limit bucket after the
   * request was accounted for. Can be negative for tiers that allow a
   * negative cancellation balance.
   */
  remaining?: number;

  /**
   * Unix timestamp, in seconds, when the current rate-limit wait period ends.
   */
  reset?: number;

  /** Rate-limit tier applied to the request. */
  tier?: string;

  /**
   * `true` when the limiter runs in warning mode and the request would have
   * been rejected under live enforcement. Monitor this to adjust request
   * patterns before enforcement begins.
   */
  warning: boolean;
};

/**
 * Listener invoked whenever a response reports per-signer rate-limit state.
 */
export type RateLimitUpdateListener = (update: RateLimitUpdate) => void;

/**
 * Parses the `Poly-RateLimit-*` response headers, returning `undefined` when
 * the response carries none of them.
 */
export function parseRateLimitHeaders(
  headers: Headers,
): RateLimitUpdate | undefined {
  const remaining = parseNumericHeader(headers.get('Poly-RateLimit-Remaining'));
  const reset = parseNumericHeader(headers.get('Poly-RateLimit-Reset'));
  const tier = headers.get('Poly-RateLimit-Tier') ?? undefined;
  const warning =
    headers.get('Poly-RateLimit-Warning')?.trim().toLowerCase() === 'true';

  if (
    remaining === undefined &&
    reset === undefined &&
    tier === undefined &&
    !warning
  ) {
    return undefined;
  }

  return { remaining, reset, tier, warning };
}

function parseNumericHeader(value: string | null): number | undefined {
  if (value === null || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
