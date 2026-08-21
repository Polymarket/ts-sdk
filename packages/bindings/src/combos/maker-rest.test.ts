import { describe, expect, it } from 'vitest';
import {
  MakerConfirmationResultSchema,
  MakerExecutionHandoffSchema,
  MakerRfqSnapshotSchema,
  MakerRfqStatus,
} from './maker-rest';

const wireRequest = {
  rfq_id: 'rfq-123',
  auth_address: '0x1111111111111111111111111111111111111111',
  signer_address: '0x1111111111111111111111111111111111111111',
  maker_address: '0x2222222222222222222222222222222222222222',
  signature_type: 0,
  leg_position_ids: ['101', '102'],
  condition_id: `0x03${'0'.repeat(60)}`,
  yes_position_id: '201',
  no_position_id: '202',
  direction: 'BUY',
  side: 'YES',
  requested_size: { unit: 'notional', value_e6: '250000000' },
  size_includes_fees: true,
  created_at: 1_755_600_000_000,
};

const wireSnapshot = {
  request: wireRequest,
  status: 'COLLECTING_QUOTES',
  competition_started_at: 1_755_600_000_100,
  competition_ends_at: 1_755_600_003_100,
  quote_id: 'quote_legacybundlefield',
  bundle: {
    requested_shares_e6: '400000000',
    blended_price_e6: '625000',
    requested_notional_e6: '250000000',
    total_required_e6: '251000000',
    allocations: [
      {
        maker_quote_id: 'quote_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        signer_address: '0x3333333333333333333333333333333333333333',
        maker_address: '0x4444444444444444444444444444444444444444',
        size_e6: '150000000',
        price_e6: '625000',
        received_at: 1_755_600_001_000,
      },
    ],
  },
  maker_confirmations: [
    {
      quote_id: 'quote_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      signer_address: '0x3333333333333333333333333333333333333333',
      maker_address: '0x4444444444444444444444444444444444444444',
      decision: 'TIMED_OUT',
      reason: 'TIMED_OUT',
      responded_at: 1_755_600_004_000,
    },
  ],
};

describe('MakerRfqSnapshotSchema', () => {
  it('parses the engine snapshot into camelCase with human decimals', () => {
    const snapshot = MakerRfqSnapshotSchema.parse(wireSnapshot);

    expect(snapshot.status).toBe(MakerRfqStatus.CollectingQuotes);
    expect(snapshot.request.rfqId).toBe('rfq-123');
    expect(snapshot.request.direction).toBe('BUY');
    expect(snapshot.request.requestedSize).toEqual({
      unit: 'notional',
      value: '250',
    });
    expect(snapshot.request.sizeIncludesFees).toBe(true);
    expect(snapshot.competitionStartedAt).toBe(1_755_600_000_100);
    expect(snapshot.bundle?.requestedShares).toBe('400');
    expect(snapshot.bundle?.blendedPrice).toBe('0.625');
    expect(snapshot.bundle?.totalRequired).toBe('251');
    expect(snapshot.bundle?.allocations).toEqual([
      {
        makerAddress: '0x4444444444444444444444444444444444444444',
        makerQuoteId: 'quote_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        price: '0.625',
        receivedAt: 1_755_600_001_000,
        signerAddress: '0x3333333333333333333333333333333333333333',
        size: '150',
      },
    ]);
    expect(snapshot.makerConfirmations?.[0]?.decision).toBe('TIMED_OUT');
  });

  it('does not surface the legacy top-level quote_id', () => {
    const snapshot = MakerRfqSnapshotSchema.parse(wireSnapshot);

    expect(snapshot).not.toHaveProperty('quoteId');
    expect(snapshot).not.toHaveProperty('quote_id');
  });

  it('omits absent optional keys instead of emitting undefined', () => {
    const snapshot = MakerRfqSnapshotSchema.parse({
      request: {
        rfq_id: 'rfq-min',
        direction: 'SELL',
        leg_position_ids: ['1'],
        signature_type: 0,
        side: 'YES',
      },
      status: 'CREATED',
    });

    expect(Object.keys(snapshot).sort()).toEqual(['request', 'status']);
    expect(Object.keys(snapshot.request).sort()).toEqual([
      'direction',
      'legPositionIds',
      'rfqId',
    ]);
  });

  it('rejects an unknown status', () => {
    expect(() =>
      MakerRfqSnapshotSchema.parse({
        ...wireSnapshot,
        status: 'SOMETHING_NEW',
      }),
    ).toThrow();
  });
});

describe('MakerExecutionHandoffSchema', () => {
  it('models the maker-relevant subset and ignores engine internals', () => {
    const handoff = MakerExecutionHandoffSchema.parse({
      execution_id: 'exec-1',
      request: wireRequest,
      quote_id: 'quote_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      bundle: {
        requested_shares_e6: '400000000',
        blended_price_e6: '625000',
        allocations: [],
      },
      requester_acceptance: { quote_id: 'quote_x', signed_order: {} },
      maker_quotes: [{ quote_id: 'quote_y' }],
      reservations: [{ wallet: '0x0' }],
      ready_at: 1_755_600_005_000,
    });

    expect(handoff.executionId).toBe('exec-1');
    expect(handoff.quoteId).toBe('quote_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(handoff.readyAt).toBe(1_755_600_005_000);
    expect(handoff).not.toHaveProperty('makerQuotes');
    expect(handoff).not.toHaveProperty('requesterAcceptance');
    expect(handoff).not.toHaveProperty('reservations');
  });
});

describe('MakerConfirmationResultSchema', () => {
  it('parses a snapshot-only result (non-final confirm or decline)', () => {
    const result = MakerConfirmationResultSchema.parse({
      snapshot: wireSnapshot,
    });

    expect(result.snapshot?.status).toBe(MakerRfqStatus.CollectingQuotes);
    expect(result.execution).toBeUndefined();
  });

  it('parses an execution-only result (final confirming maker)', () => {
    const result = MakerConfirmationResultSchema.parse({
      execution: {
        execution_id: 'exec-2',
        quote_id: 'quote_cccccccccccccccccccccccccccccccc',
        bundle: {
          requested_shares_e6: '1000000',
          blended_price_e6: '500000',
          allocations: null,
        },
      },
    });

    expect(result.execution?.executionId).toBe('exec-2');
    expect(result.execution?.bundle.allocations).toEqual([]);
    expect(result.snapshot).toBeUndefined();
  });

  it('parses an empty result without inventing keys', () => {
    expect(MakerConfirmationResultSchema.parse({})).toEqual({});
  });
});
