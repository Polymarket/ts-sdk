import {
  TradingRestrictionErrorResponseSchema,
  TradingRestrictionResponseType,
} from '@polymarket/bindings/clob';
import { RequestRejectedError, TradingRestriction } from '../../errors';
import type {
  ServiceRejectedResponse,
  ServiceRejectedResponseMapper,
} from '../../ServiceClient';

export const mapTradingRestrictionResponse: ServiceRejectedResponseMapper = (
  response,
) => {
  const restriction = parseTradingRestriction(response);

  if (restriction === undefined) {
    return undefined;
  }

  return new RequestRejectedError(response.message, {
    restriction,
    retryAfter: response.retryAfter,
    status: response.status,
  });
};

function parseTradingRestriction(
  response: ServiceRejectedResponse,
): TradingRestriction | undefined {
  if (response.status === 425) {
    return TradingRestriction.RESTARTING;
  }

  if (response.status !== 503) {
    return undefined;
  }

  const parsed = TradingRestrictionErrorResponseSchema.safeParse(response.body);

  if (!parsed.success) {
    return undefined;
  }

  switch (parsed.data.type) {
    case TradingRestrictionResponseType.CANCEL_ONLY:
      return TradingRestriction.CANCEL_ONLY;
    case TradingRestrictionResponseType.POST_ONLY:
      return TradingRestriction.POST_ONLY;
  }
}
