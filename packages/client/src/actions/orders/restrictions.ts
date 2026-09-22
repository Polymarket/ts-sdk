import {
  type RateLimitError,
  RequestRejectedError,
  TradingRestriction,
  type TransportError,
} from '../../errors';

export function mapTradingRestrictionError(
  error: RateLimitError | RequestRejectedError | TransportError,
): RateLimitError | RequestRejectedError | TransportError {
  if (!(error instanceof RequestRejectedError)) {
    return error;
  }

  const restriction = parseTradingRestriction(error);

  if (restriction === undefined) {
    return error;
  }

  return new RequestRejectedError(error.message, {
    cause: error,
    ...(error.code !== undefined ? { code: error.code } : {}),
    restriction,
    ...(error.retryAfter !== undefined ? { retryAfter: error.retryAfter } : {}),
    status: error.status,
  });
}

function parseTradingRestriction(
  error: RequestRejectedError,
): TradingRestriction | undefined {
  if (error.status === 425) {
    return TradingRestriction.RESTARTING;
  }

  if (error.status === 503 && error.code === 'post_only_mode') {
    return TradingRestriction.POST_ONLY;
  }

  return undefined;
}
