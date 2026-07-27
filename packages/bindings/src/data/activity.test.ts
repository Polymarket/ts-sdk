import { describe, expect, it } from 'vitest';
import { ActivitySchema } from './activity';
import { ActivityType } from './common';

describe('ActivitySchema', () => {
  it.each([
    ActivityType.DEPOSIT,
    ActivityType.WITHDRAWAL,
    ActivityType.TAKER_REBATE,
  ])('parses %s rows as account-level credits', (type) => {
    const activity = ActivitySchema.parse({
      proxyWallet: `0x${'1'.repeat(40)}`,
      timestamp: 1_700_000_000,
      type,
      usdcSize: 12.5,
      transactionHash: `0x${'a'.repeat(64)}`,
    });

    expect(activity.type).toBe(type);
    expect(activity).toHaveProperty('amount', '12.5');
  });
});
