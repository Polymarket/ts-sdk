import { expectEvmAddress } from '@polymarket/types';
import { describe, expect, it } from 'vitest';
import { CollateralReturnPlanResponseSchema } from './plan';

const PLAN_HASH = `0x${'ab'.repeat(32)}`;
const WALLET = expectEvmAddress('0x2222222222222222222222222222222222222222');
const ROUTER_DATA = '0xdeadbeef';
type PlanWireOperation = {
  kind: string;
  condition_id?: string;
  event_id?: string;
  position_id?: string;
  condition_index?: number;
  amount: string;
};

const planWire = {
  plan_hash: PLAN_HASH,
  chain_id: 137,
  wallet: WALLET,
  block_number: '74000000',
  starting_pusd: '123.456789',
  net_pusd_out: '1.000000',
  final_pusd: '124.456789',
  operations: [
    {
      // The wire pads bytes31 condition IDs to 32 bytes.
      kind: 'merge',
      condition_id: `0x03${'ab'.repeat(29)}0100`,
      amount: '1000000',
    },
    {
      kind: 'extract',
      position_id: '123',
      condition_index: 2,
      amount: '500000',
    },
  ] as PlanWireOperation[],
  operation_count: 2,
  truncated: true,
  estimated_cost: 1240,
  required_pusd_input: '0.000000',
  required_positions: [{ position_id: '123', amount: '2000000' }],
  position_summary: {
    consumed: [{ position_id: '123', amount: '2000000' }],
    created: [{ position_id: '456', amount: '1500000' }],
  },
  candidate_position_ids: ['123'],
  router_call: {
    to: expectEvmAddress('0x5555555555555555555555555555555555555555'),
    data: ROUTER_DATA,
  },
};

describe('collateral return plan parsing', () => {
  it('normalizes padded condition IDs, base-unit amounts and the block number', () => {
    const plan = CollateralReturnPlanResponseSchema.parse(planWire);
    expect(plan.planHash).toBe(PLAN_HASH);
    expect(plan.blockNumber).toBe(74000000n);
    expect(plan.netPusdOut).toBe('1.000000');
    expect(plan.requiredPositions).toEqual([
      { positionId: '123', amount: '2' },
    ]);
    expect(plan.operations[0]).toMatchObject({
      kind: 'merge',
      conditionId: `0x03${'ab'.repeat(29)}01`,
      amount: '1',
    });
    expect(plan.routerCall).toEqual({
      to: planWire.router_call.to,
      data: ROUTER_DATA,
    });
  });
  it('keeps operation kinds introduced after the SDK release', () => {
    expect(
      CollateralReturnPlanResponseSchema.parse({
        ...planWire,
        operations: [{ kind: 'not_yet_known_kind', amount: '1000000' }],
      }).operations[0]?.kind,
    ).toBe('not_yet_known_kind');
  });
});
