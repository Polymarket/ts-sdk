import { describe, expect, it } from 'vitest';
import { ActivitySchema, TradeSchema } from './activity';
import { ActivityType } from './common';

function activityRow(overrides: Record<string, unknown>) {
  return {
    proxy_wallet: `0x${'1'.repeat(40)}`,
    timestamp: 1_700_000_000,
    condition_id: '',
    size: 0,
    usdc_size: 0,
    transaction_hash: `0x${'b'.repeat(64)}`,
    price: 0,
    token_id: '',
    side: '',
    outcome_index: 999,
    title: '',
    slug: '',
    icon: '',
    event_slug: '',
    outcome: '',
    name: '',
    pseudonym: '',
    bio: '',
    profile_image: '',
    profile_image_optimized: '',
    ...overrides,
  };
}

describe('ActivitySchema', () => {
  it('normalizes ordinary trade assets without assuming the protocol', () => {
    const assetId = '456';
    const activity = ActivitySchema.parse(
      activityRow({
        type: ActivityType.TRADE,
        side: 'BUY',
        size: 10,
        usdc_size: 5,
        price: 0.5,
        token_id: assetId,
        condition_id: `0x${'a'.repeat(64)}`,
        outcome: 'Yes',
        outcome_index: 0,
        title: 'Will this normalize?',
        slug: 'will-this-normalize',
        event_slug: 'normalization-event',
      }),
    );

    expect(activity).toMatchObject({
      type: ActivityType.TRADE,
      isCombo: false,
      assetId,
      tokenId: assetId,
      shares: 10,
      amount: 5,
      timestamp: 1_700_000_000_000,
    });
  });

  it.each([
    ActivityType.DEPOSIT,
    ActivityType.WITHDRAWAL,
    ActivityType.TAKER_REBATE,
  ])('parses %s rows as account-level credits', (type) => {
    const activity = ActivitySchema.parse(
      activityRow({ type, usdc_size: 12.5 }),
    );

    expect(activity.type).toBe(type);
    expect(activity).toHaveProperty('amount', 12.5);
  });
});

describe('TradeSchema', () => {
  it('normalizes the strict wire row to the SDK vocabulary', () => {
    const trade = TradeSchema.parse({
      proxy_wallet: `0x${'1'.repeat(40)}`,
      side: 'BUY',
      token_id: '123',
      condition_id: `0x${'c'.repeat(64)}`,
      size: 11,
      price: 0.999,
      timestamp: 1_700_000_000,
      title: 'Will it happen?',
      slug: 'will-it-happen',
      icon: 'https://example.invalid/icon.png',
      // The wire encodes absence as an empty string and an unknown outcome
      // index as the 999 sentinel; both must come out as `undefined`.
      event_slug: '',
      outcome: 'No',
      outcome_index: 999,
      name: '',
      pseudonym: 'Unkempt-Embassy',
      bio: '',
      profile_image: '',
      profile_image_optimized: '',
      transaction_hash: `0x${'a'.repeat(64)}`,
    });

    expect(trade.wallet).toBe(`0x${'1'.repeat(40)}`);
    expect(trade.assetId).toBe('123');
    expect(trade.tokenId).toBe('123');
    expect(trade.conditionId).toBe(`0x${'c'.repeat(64)}`);
    expect(trade.timestamp).toBe(1_700_000_000_000);
    expect(trade.eventSlug).toBeUndefined();
    expect(trade.outcomeIndex).toBeUndefined();
    expect(trade.name).toBeUndefined();
    expect(trade.pseudonym).toBe('Unkempt-Embassy');
    expect(trade.transactionHash).toBe(`0x${'a'.repeat(64)}`);
    expect(trade).not.toHaveProperty('proxy_wallet');
  });

  it('keeps a known outcome index, including zero', () => {
    const row = {
      proxy_wallet: `0x${'1'.repeat(40)}`,
      side: 'SELL',
      token_id: '123',
      condition_id: `0x${'c'.repeat(64)}`,
      size: 1,
      price: 0.5,
      timestamp: 1_700_000_000,
      title: 't',
      slug: 's',
      icon: '',
      event_slug: '',
      outcome: 'Yes',
      outcome_index: 0,
      name: '',
      pseudonym: '',
      bio: '',
      profile_image: '',
      profile_image_optimized: '',
      transaction_hash: `0x${'a'.repeat(64)}`,
    };

    expect(TradeSchema.parse(row).outcomeIndex).toBe(0);
  });
});
