import { describe, expect, it } from 'vitest';
import { ActivitySchema } from './activity';
import { ActivityType } from './common';

describe('ActivitySchema', () => {
  it('normalizes ordinary trade assets without assuming the protocol', () => {
    const assetId = '456';
    const activity = ActivitySchema.parse({
      proxyWallet: `0x${'1'.repeat(40)}`,
      timestamp: 1_700_000_000,
      type: ActivityType.TRADE,
      side: 'BUY',
      size: 10,
      usdcSize: 5,
      price: 0.5,
      asset: assetId,
      conditionId: `0x${'a'.repeat(64)}`,
      outcome: 'Yes',
      outcomeIndex: 0,
      title: 'Will this normalize?',
      slug: 'will-this-normalize',
      eventSlug: 'normalization-event',
      transactionHash: `0x${'b'.repeat(64)}`,
    });

    expect(activity).toMatchObject({
      type: ActivityType.TRADE,
      isCombo: false,
      assetId,
      tokenId: assetId,
    });
  });

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
