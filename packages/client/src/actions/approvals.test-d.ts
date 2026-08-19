import { describe, expectTypeOf, it } from 'vitest';
import type {
  FetchTradingApprovalsStateRequest,
  SecureFetchTradingApprovalsStateRequest,
} from '../index';

describe('trading approval state request types', () => {
  it('exports explicit public and secure wallet contracts', () => {
    expectTypeOf<FetchTradingApprovalsStateRequest>().toEqualTypeOf<{
      wallet: string;
    }>();
    expectTypeOf<SecureFetchTradingApprovalsStateRequest>().toEqualTypeOf<{
      wallet?: string;
    }>();
  });
});
