import {
  type ComboConditionId,
  toComboConditionId,
  toConditionId,
} from '@polymarket/bindings';
import {
  type ProtocolEventId,
  ProtocolEventIdSchema,
  ThresholdSide,
} from '@polymarket/bindings/protocol';
import { expectEvmAddress } from '@polymarket/types';
import { describe, expect, it } from 'vitest';
import {
  MAX_UINT256,
  routerComposeThresholdCall,
  routerConvertCall,
  routerDecomposeThresholdCall,
  routerHorizontalMergeCall,
  routerHorizontalSplitCall,
  routerMergeCall,
  routerMergeDirectionalCall,
  routerRedeemCall,
  routerSplitCall,
  routerSplitDirectionalCall,
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

const EVENT_ID = ProtocolEventIdSchema.parse(
  `0x04${'12'.repeat(16)}0008${'00'.repeat(8)}0000`,
);

describe('Multi-outcome Router ABI helpers', () => {
  // Selectors from the polymarket-v2 compiled Router ABI. A changed parameter
  // type changes the selector, so these pin the full signatures.
  it.each([
    ['0x40657b52', routerHorizontalSplitCall(ROUTER_ADDRESS, EVENT_ID, 1n)],
    ['0x24f24944', routerHorizontalMergeCall(ROUTER_ADDRESS, EVENT_ID, 1n)],
    ['0x9380f1c8', routerConvertCall(ROUTER_ADDRESS, EVENT_ID, 8, 1n)],
    [
      '0xc66feac2',
      routerComposeThresholdCall(
        ROUTER_ADDRESS,
        EVENT_ID,
        2,
        ThresholdSide.Above,
        1n,
      ),
    ],
    [
      '0xb34170d6',
      routerDecomposeThresholdCall(
        ROUTER_ADDRESS,
        EVENT_ID,
        2,
        ThresholdSide.Below,
        1n,
      ),
    ],
    [
      '0xba860eec',
      routerSplitDirectionalCall(ROUTER_ADDRESS, EVENT_ID, 2, 5, 1n),
    ],
    [
      '0x77b72427',
      routerMergeDirectionalCall(ROUTER_ADDRESS, EVENT_ID, 2, 5, 1n),
    ],
  ])('encodes Router selector %s', (selector, call) => {
    expect(call.to).toBe(ROUTER_ADDRESS);
    expect(call.data.slice(0, 10)).toBe(selector);
  });

  it('encodes threshold sides as ABOVE = 0 and BELOW = 1', () => {
    function sideWord(side: ThresholdSide): string {
      const { data } = routerComposeThresholdCall(
        ROUTER_ADDRESS,
        EVENT_ID,
        2,
        side,
        1n,
      );
      return data.slice(10 + 64 * 2, 10 + 64 * 3);
    }

    expect(BigInt(`0x${sideWord(ThresholdSide.Above)}`)).toBe(0n);
    expect(BigInt(`0x${sideWord(ThresholdSide.Below)}`)).toBe(1n);
  });

  it('normalizes zero-padded event roots and rejects dirty condition or outcome suffixes', () => {
    const canonical = routerHorizontalSplitCall(ROUTER_ADDRESS, EVENT_ID, 1n);
    expect(
      routerHorizontalSplitCall(
        ROUTER_ADDRESS,
        `${EVENT_ID}000000` as ProtocolEventId,
        1n,
      ),
    ).toEqual(canonical);
    for (const suffix of ['000001', '000100', '00000100', '0000']) {
      expect(() =>
        routerHorizontalSplitCall(
          ROUTER_ADDRESS,
          `${EVENT_ID}${suffix}` as ProtocolEventId,
          1n,
        ),
      ).toThrow(UserInputError);
    }
  });

  it('preserves uint16 descriptor width and uint256 amount precision', () => {
    expect(
      routerConvertCall(ROUTER_ADDRESS, EVENT_ID, 0xffff, MAX_UINT256).data,
    ).toBe(
      `0x9380f1c8${EVENT_ID.slice(2).padEnd(64, '0')}${'ffff'.padStart(64, '0')}${'f'.repeat(64)}`,
    );
    for (const index of [
      -1,
      0x10000,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() =>
        routerConvertCall(ROUTER_ADDRESS, EVENT_ID, index, 1n),
      ).toThrow(UserInputError);
    }
    for (const amount of [-1n, MAX_UINT256 + 1n]) {
      expect(() =>
        routerHorizontalMergeCall(ROUTER_ADDRESS, EVENT_ID, amount),
      ).toThrow(UserInputError);
    }
    expect(() =>
      routerComposeThresholdCall(
        ROUTER_ADDRESS,
        EVENT_ID,
        2,
        'ABOVE' as ThresholdSide,
        1n,
      ),
    ).toThrow(UserInputError);
    expect(() =>
      routerSplitDirectionalCall(ROUTER_ADDRESS, EVENT_ID, 1.5, 4, 1n),
    ).toThrow(UserInputError);
  });
});
