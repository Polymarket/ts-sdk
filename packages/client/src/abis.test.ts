import {
  type ComboConditionId,
  toComboConditionId,
  toConditionId,
} from '@polymarket/bindings';
import { expectEvmAddress } from '@polymarket/types';
import { AbiFunction } from 'ox';
import { describe, expect, it } from 'vitest';
import {
  routerConvertCall,
  routerHorizontalMergeCall,
  routerHorizontalSplitCall,
  routerMergeCall,
  routerRedeemCall,
  routerSplitCall,
} from './abis';
import { UserInputError } from './errors';

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
  const eventId =
    '0x0211111111111111111111111111111111000300000000000000000000';

  it('encodes the Router neg-risk ABI and canonicalizes zero-padded event IDs', () => {
    const amount = 1_000_000n;
    const convertAbi = AbiFunction.from(
      'function convert(bytes29 eventId, uint16 conditionIndex, uint256 amount)',
    );
    const convertCall = routerConvertCall(ROUTER_ADDRESS, eventId, 3, amount);
    expect(convertCall.to).toBe(ROUTER_ADDRESS);
    expect(AbiFunction.decodeData(convertAbi, convertCall.data)).toEqual([
      eventId,
      3,
      amount,
    ]);
    expect(
      routerConvertCall(ROUTER_ADDRESS, `${eventId}000000`, 3, amount),
    ).toEqual(convertCall);
    for (const [name, helper] of [
      ['horizontalSplit', routerHorizontalSplitCall],
      ['horizontalMerge', routerHorizontalMergeCall],
    ] as const) {
      const call = helper(ROUTER_ADDRESS, eventId, amount);
      const abi = AbiFunction.from(
        `function ${name}(bytes29 eventId, uint256 amount)`,
      );
      expect(AbiFunction.decodeData(abi, call.data)).toEqual([eventId, amount]);
      expect(call.to).toBe(ROUTER_ADDRESS);
      expect(helper(ROUTER_ADDRESS, `${eventId}000000`, amount)).toEqual(call);
    }
  });

  it.each([
    '123',
    `${eventId}000001`,
    `${eventId}000100`,
    `${eventId}010000`,
    eventId.replace('0x02', '0x01'),
    '0x0211111111111111111111111111111111000300000000000000010000',
    '0x0211111111111111111111111111111111000100000000000000000000',
  ])('rejects non-event and invalid neg-risk IDs: %s', (invalidId) => {
    expect(() => routerConvertCall(ROUTER_ADDRESS, invalidId, 0, 1n)).toThrow(
      UserInputError,
    );
    expect(() =>
      routerHorizontalSplitCall(ROUTER_ADDRESS, invalidId, 1n),
    ).toThrow(UserInputError);
    expect(() =>
      routerHorizontalMergeCall(ROUTER_ADDRESS, invalidId, 1n),
    ).toThrow(UserInputError);
  });

  it('accepts the synthetic Other index and rejects indices outside the event', () => {
    expect(() =>
      routerConvertCall(ROUTER_ADDRESS, eventId, 0, 1n),
    ).not.toThrow();
    expect(() =>
      routerConvertCall(ROUTER_ADDRESS, eventId, 3, 1n),
    ).not.toThrow();
    for (const index of [-1, 1.5, 4, 65536, Number.NaN]) {
      expect(() =>
        routerConvertCall(ROUTER_ADDRESS, eventId, index, 1n),
      ).toThrow(UserInputError);
    }
  });

  it('preserves the full uint16 index, uint256 amount, and resolution-chain fields', () => {
    const largestEventId =
      '0x0211111111111111111111111111111111ffff000000000000000000ff';
    const amount = (1n << 256n) - 1n;
    const call = routerConvertCall(
      ROUTER_ADDRESS,
      largestEventId,
      65535,
      amount,
    );
    const abi = AbiFunction.from(
      'function convert(bytes29 eventId, uint16 conditionIndex, uint256 amount)',
    );
    expect(AbiFunction.decodeData(abi, call.data)).toEqual([
      largestEventId,
      65535,
      amount,
    ]);
  });

  it.each([
    0n,
    -1n,
    1n << 256n,
  ])('rejects invalid explicit amounts: %s', (amount) => {
    expect(() => routerConvertCall(ROUTER_ADDRESS, eventId, 0, amount)).toThrow(
      UserInputError,
    );
    expect(() =>
      routerHorizontalSplitCall(ROUTER_ADDRESS, eventId, amount),
    ).toThrow(UserInputError);
    expect(() =>
      routerHorizontalMergeCall(ROUTER_ADDRESS, eventId, amount),
    ).toThrow(UserInputError);
  });

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
