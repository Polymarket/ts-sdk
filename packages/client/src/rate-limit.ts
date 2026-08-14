/** Independent rate-limit bucket affected by an order or cancellation. */
export type RateLimitBucket = 'order' | 'cancel';

/**
 * Per-signer rate-limit state reported by order and cancellation responses.
 *
 * @remarks
 * Fields mirror the `Poly-RateLimit-*` response headers. `remaining` and
 * `reset` are normally reported together, while `tier` can be absent. These
 * fields remain optional because malformed header values are ignored;
 * `warning` is `false` whenever the response does not report warning mode.
 */
export type RateLimitUpdate = {
  /** Rate-limit bucket affected by the request, when recognized by the SDK. */
  bucket?: RateLimitBucket;

  /**
   * Token balance remaining in the applicable rate-limit bucket after the
   * request was accounted for. Can be negative for tiers that allow a
   * negative cancellation balance. A value of `0` alone does not prove the
   * bucket is exhausted because it can also be reported when no active limit
   * applies; do not back off solely because this value is zero.
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
  bucket?: RateLimitBucket,
): RateLimitUpdate | undefined {
  const remaining = parseIntegerHeader(
    headers.get('Poly-RateLimit-Remaining'),
    /^-?\d+$/,
  );
  const reset = parseIntegerHeader(
    headers.get('Poly-RateLimit-Reset'),
    /^\d+$/,
  );
  const tier = parseTextHeader(headers.get('Poly-RateLimit-Tier'));
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

  return {
    ...(bucket === undefined ? {} : { bucket }),
    remaining,
    reset,
    tier,
    warning,
  };
}

function parseIntegerHeader(
  value: string | null,
  format: RegExp,
): number | undefined {
  const normalized = value?.trim();
  if (normalized === undefined || !format.test(normalized)) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseTextHeader(value: string | null): string | undefined {
  if (value === null || value.trim() === '') {
    return undefined;
  }

  return value;
}
