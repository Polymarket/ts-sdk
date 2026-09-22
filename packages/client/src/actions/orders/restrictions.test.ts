import { describe, expect, it } from 'vitest';
import {
  RateLimitError,
  RequestRejectedError,
  TradingRestriction,
} from '../../errors';
import { mapTradingRestrictionError } from './restrictions';

describe('mapTradingRestrictionError', () => {
  it.each([
    {
      code: undefined,
      expected: TradingRestriction.RESTARTING,
      retryAfter: 1,
      status: 425,
    },
    {
      code: 'post_only_mode',
      expected: TradingRestriction.POST_ONLY,
      retryAfter: 79,
      status: 503,
    },
  ])('maps HTTP $status rejections to $expected', (testCase) => {
    const error = new RequestRejectedError('request rejected', {
      ...(testCase.code !== undefined ? { code: testCase.code } : {}),
      retryAfter: testCase.retryAfter,
      status: testCase.status,
    });

    expect(mapTradingRestrictionError(error)).toMatchObject({
      cause: error,
      code: testCase.code,
      restriction: testCase.expected,
      retryAfter: testCase.retryAfter,
      status: testCase.status,
    });
  });

  it('leaves trading-disabled responses unclassified without a wire code', () => {
    const error = new RequestRejectedError('trading is disabled', {
      status: 503,
    });

    expect(mapTradingRestrictionError(error)).toBe(error);
  });

  it('leaves unrelated errors unchanged', () => {
    const error = new RateLimitError('rate limited', { retryAfter: 3 });

    expect(mapTradingRestrictionError(error)).toBe(error);
  });
});
