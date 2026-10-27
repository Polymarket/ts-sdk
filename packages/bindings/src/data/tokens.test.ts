import { describe, expect, it } from 'vitest';
import { FetchTokenReferencesResponseSchema, TokenModule } from './tokens';

// Representative rows from the pinned tokens.rs contract, not a live capture.
const row = {
  token_id: '123',
  condition_id: `0x${'ab'.repeat(32)}`,
  structural_condition_id: null,
  module: 'v1_ctf',
  outcome_index: 1,
  clob_index: 0,
  outcome: 'Yes',
  opposite_token_id: '124',
  resolved: true,
  final_price: 0.5,
  title: 'Question?',
  market_slug: 'question',
  closed: true,
  neg_risk: false,
  neg_risk_market_id: null,
  question_index: null,
  event_id: 1234,
  event_slug: 'event',
};

const nullableFields = [
  'structural_condition_id',
  'clob_index',
  'outcome',
  'opposite_token_id',
  'final_price',
  'title',
  'market_slug',
  'closed',
  'neg_risk',
  'neg_risk_market_id',
  'question_index',
  'event_id',
  'event_slug',
];

describe('token references', () => {
  it('unwraps a direct collection and preserves ordered duplicate groups', () => {
    const result = FetchTokenReferencesResponseSchema.parse({
      data: [row, { ...row, token_id: '124' }, row],
    });
    expect(result.map((reference) => reference.assetId)).toEqual([
      '123',
      '124',
      '123',
    ]);
    expect(result[0]).toMatchObject({
      module: TokenModule.V1Ctf,
      finalPrice: '0.5',
      eventId: '1234',
      outcomeIndex: 1,
      clobIndex: 0,
      oppositeAssetId: '124',
    });
    expect(FetchTokenReferencesResponseSchema.parse({ data: [] })).toEqual([]);
  });

  it.each([
    'v1_ctf',
    'binary',
    'neg_risk',
    'combo',
  ])('supports %s including explicit null fields', (module) => {
    const nulls = Object.fromEntries(
      nullableFields.map((field) => [field, null]),
    );
    const [reference] = FetchTokenReferencesResponseSchema.parse({
      data: [{ ...row, ...nulls, module }],
    });
    expect(reference?.module).toBe(module);
    expect(reference?.finalPrice).toBeNull();
    expect(reference?.structuralConditionId).toBeNull();
    expect(reference?.eventId).toBeNull();
    expect(reference?.clobIndex).toBeNull();
  });

  it.each(nullableFields)('requires explicit nullable field %s', (field) => {
    const incomplete: Record<string, unknown> = { ...row };
    delete incomplete[field];
    expect(
      FetchTokenReferencesResponseSchema.safeParse({ data: [incomplete] })
        .success,
    ).toBe(false);
  });

  it.each([
    { module: 'future' },
    { condition_id: 'not-hex' },
    { structural_condition_id: `0x${'a'.repeat(62)}` },
    { outcome_index: 0.5 },
    { final_price: '0.5' },
    { resolved: 'true' },
    { event_id: 1.5 },
  ])('rejects malformed contract fields %j', (invalid) => {
    expect(
      FetchTokenReferencesResponseSchema.safeParse({
        data: [{ ...row, ...invalid }],
      }).success,
    ).toBe(false);
  });
});
