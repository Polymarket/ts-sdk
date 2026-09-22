import {
  type ComboConditionId,
  toComboConditionId,
  toConditionId,
} from '@polymarket/bindings';
import { expectEvmAddress } from '@polymarket/types';
import { describe, expect, it } from 'vitest';
import { routerMergeCall, routerRedeemCall, routerSplitCall } from './abis';

const ROUTER_ADDRESS = expectEvmAddress(
  '0x12121212006e4CD160D18e3f00711DA5c3372600',
);
const CONDITION_ID = toComboConditionId(
  '0x032def24bfb0c5c57fb236fac08b94236a0000000000000000000000000000',
);
// Simulates untyped JS callers that bypass the branded parser.
const YES_POSITION_CONDITION_ID =
  `${CONDITION_ID}00` as unknown as ComboConditionId;
const NO_POSITION_CONDITION_ID =
  `${CONDITION_ID}01` as unknown as ComboConditionId;

describe('Router ABI helpers', () => {
  it.each([
    '0x012def24bfb0c5c57fb236fac08b94236a0000000000000000000000000000',
    '0x022def24bfb0c5c57fb236fac08b94236a0000000000000000000000000000',
  ])('normalizes ordinary protocol v2 condition %s', (conditionId) => {
    const canonicalConditionId = toConditionId(conditionId);
    const paddedConditionId = toConditionId(`${conditionId}00`);

    expect(routerSplitCall(ROUTER_ADDRESS, paddedConditionId, 1n)).toEqual(
      routerSplitCall(ROUTER_ADDRESS, canonicalConditionId, 1n),
    );
    expect(routerMergeCall(ROUTER_ADDRESS, paddedConditionId, 1n)).toEqual(
      routerMergeCall(ROUTER_ADDRESS, canonicalConditionId, 1n),
    );
    expect(routerRedeemCall(ROUTER_ADDRESS, paddedConditionId, 0, 1n)).toEqual(
      routerRedeemCall(ROUTER_ADDRESS, canonicalConditionId, 0, 1n),
    );
  });

  it('normalizes bytes32 combo condition wire forms before encoding', () => {
    expect(
      routerSplitCall(ROUTER_ADDRESS, YES_POSITION_CONDITION_ID, 1n),
    ).toEqual(routerSplitCall(ROUTER_ADDRESS, CONDITION_ID, 1n));
    expect(
      routerSplitCall(ROUTER_ADDRESS, NO_POSITION_CONDITION_ID, 1n),
    ).toEqual(routerSplitCall(ROUTER_ADDRESS, CONDITION_ID, 1n));

    expect(
      routerMergeCall(ROUTER_ADDRESS, YES_POSITION_CONDITION_ID, 1n),
    ).toEqual(routerMergeCall(ROUTER_ADDRESS, CONDITION_ID, 1n));
    expect(
      routerMergeCall(ROUTER_ADDRESS, NO_POSITION_CONDITION_ID, 1n),
    ).toEqual(routerMergeCall(ROUTER_ADDRESS, CONDITION_ID, 1n));

    expect(
      routerRedeemCall(ROUTER_ADDRESS, YES_POSITION_CONDITION_ID, 1, 1n),
    ).toEqual(routerRedeemCall(ROUTER_ADDRESS, CONDITION_ID, 1, 1n));
    expect(
      routerRedeemCall(ROUTER_ADDRESS, NO_POSITION_CONDITION_ID, 1, 1n),
    ).toEqual(routerRedeemCall(ROUTER_ADDRESS, CONDITION_ID, 1, 1n));
  });
});
