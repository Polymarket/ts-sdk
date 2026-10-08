import { describe, expect, it } from 'vitest';
import {
  ActivitySchema,
  ListActivityResponseSchema,
  TradeSchema,
} from './activity';
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
      shares: '10',
      amount: '5',
      timestamp: 1_700_000_000_000,
    });
  });

  it('omits an unknown outcome index on ordinary trades', () => {
    const activity = ActivitySchema.parse(
      activityRow({
        type: ActivityType.TRADE,
        side: 'BUY',
        size: 10,
        usdc_size: 5,
        price: 0.5,
        token_id: '456',
        condition_id: `0x${'a'.repeat(64)}`,
        outcome: 'Yes',
        outcome_index: 999,
        title: 'Will this normalize?',
        slug: 'will-this-normalize',
        event_slug: 'normalization-event',
      }),
    );

    expect(activity).toMatchObject({
      type: ActivityType.TRADE,
      isCombo: false,
      outcome: 'Yes',
    });
    expect(activity).toHaveProperty('outcomeIndex', undefined);
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
    expect(activity).toHaveProperty('amount', '12.5');
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

describe('TipActivity', () => {
  it('normalizes the IN/OUT direction the wire serves on tip rows', () => {
    const tip = ActivitySchema.parse(
      activityRow({ type: ActivityType.TIP, usdc_size: 2.5, side: 'IN' }),
    );

    expect(tip).toMatchObject({ type: 'TIP', amount: '2.5', side: 'IN' });
  });

  it('serves side as null on tip rows predating the direction field', () => {
    const tip = ActivitySchema.parse(
      activityRow({ type: ActivityType.TIP, usdc_size: 1, side: '' }),
    );

    expect(tip).toMatchObject({ type: 'TIP', amount: '1', side: null });
  });
});

// data-api-v2 53a79ac: pg_activity combo_token_outcomes_survive_projection_and_keyset.
// The basket has no market metadata; outcomes name its token, not a selected leg.
const comboConditionId = `0x03${'ab'.repeat(30)}`;
function comboRow(type: ActivityType, outcome: string, outcomeIndex: number) {
  return activityRow({
    type,
    is_combo: true,
    condition_id: comboConditionId,
    token_id: String(
      1373525411643998707269718504228978186297414887389368269897738957660941713408n +
        BigInt(outcomeIndex === 999 ? 2 : outcomeIndex),
    ),
    size: 17.105871,
    usdc_size: 0.5,
    price: 0.03,
    side: 'BUY',
    title: 'Georgia vs. Arkansas',
    outcome,
    outcome_index: outcomeIndex,
  });
}

describe('general activity token outcomes', () => {
  it.each([
    [ActivityType.TRADE, 'BUY', 'Yes', 0],
    [ActivityType.TRADE, 'BUY', 'No', 1],
    [ActivityType.TRADE, 'SELL', 'Yes', 0],
    [ActivityType.TRADE, 'SELL', 'No', 1],
    // Manual and AUTO_REDEEM project to the same REDEEM wire kind.
    [ActivityType.REDEEM, '', 'Yes', 0],
    [ActivityType.REDEEM, '', 'No', 1],
  ] as const)('preserves %s %s token outcome %s/%s', (type, side, outcome, index) => {
    const activity = ActivitySchema.parse({
      ...comboRow(type, outcome, index),
      side,
    });
    expect(activity).toMatchObject({
      type,
      isCombo: true,
      conditionId: comboConditionId,
      outcome,
      outcomeIndex: index,
      amount: '0.5',
    });
  });

  it.each([
    ActivityType.TRADE,
    ActivityType.REDEEM,
  ])('keeps unknown %s sides unavailable', (type) => {
    const activity = ActivitySchema.parse(comboRow(type, '', 999));
    expect(activity).toHaveProperty('outcome', undefined);
    expect(activity).toHaveProperty('outcomeIndex', undefined);
  });

  it.each([
    false,
    undefined,
  ])('preserves full CTF identifiers when is_combo=%s', (isCombo) => {
    const conditionId = `0x03${'cd'.repeat(30)}00`;
    const activity = ActivitySchema.parse(
      activityRow({
        type: ActivityType.REDEEM,
        is_combo: isCombo,
        condition_id: conditionId,
        title: 'Georgia vs. Arkansas',
        slug: 'georgia-arkansas',
        event_slug: 'basketball',
        outcome: 'Arkansas',
        outcome_index: 1,
      }),
    );
    expect(activity).toMatchObject({
      type: ActivityType.REDEEM,
      isCombo: false,
      conditionId,
      outcome: 'Arkansas',
      outcomeIndex: 1,
    });
  });

  it('retains mixed page order and the server cursor', () => {
    const page = ListActivityResponseSchema.parse({
      data: [
        comboRow(ActivityType.TRADE, 'Yes', 0),
        comboRow(ActivityType.REDEEM, 'No', 1),
        activityRow({ type: ActivityType.REWARD, usdc_size: 2 }),
      ],
      pagination: {
        limit: 3,
        offset: 0,
        has_more: true,
        next_cursor: 'opaque',
      },
    });
    expect(page.items.map(({ type }) => type)).toEqual([
      'TRADE',
      'REDEEM',
      'REWARD',
    ]);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('opaque');
    expect(page.items[1]).toMatchObject({ isCombo: true, outcome: 'No' });
  });

  it('rejects malformed combo redemption identifiers', () => {
    const result = ActivitySchema.safeParse({
      ...comboRow(ActivityType.REDEEM, 'No', 1),
      condition_id: `0x01${'ab'.repeat(30)}`,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(({ path }) => path[0] === 'condition_id'),
      ).toBe(true);
    }
  });
});

it.each([
  ActivityType.SPLIT,
  ActivityType.MERGE,
])('preserves the existing %s variant', (type) => {
  expect(
    ActivitySchema.parse(
      activityRow({
        type,
        condition_id: `0x${'c'.repeat(64)}`,
        title: 'A market',
        slug: 'a-market',
        event_slug: 'an-event',
      }),
    ).type,
  ).toBe(type);
});

it.each([
  '',
  undefined,
])('retains combo redemptions without presentation metadata: %s', (title) => {
  const redemption = {
    ...comboRow(ActivityType.REDEEM, 'No', 1),
    title,
    icon: undefined,
    slug: undefined,
    event_slug: undefined,
  };
  const page = ListActivityResponseSchema.parse({
    data: [
      activityRow({ type: ActivityType.REWARD, usdc_size: 2 }),
      redemption,
    ],
    pagination: { limit: 2, offset: 0, has_more: false, next_cursor: null },
  });
  expect(page.items.map(({ type }) => type)).toEqual(['REWARD', 'REDEEM']);
  expect(page.items[1]).toMatchObject({
    isCombo: true,
    conditionId: comboConditionId,
    outcome: 'No',
    outcomeIndex: 1,
    amount: '0.5',
    title: undefined,
    icon: null,
  });
});
