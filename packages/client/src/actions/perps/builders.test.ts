import { toDecimalString, toEpochMilliseconds } from '@polymarket/bindings';
import { expectEvmAddress, expectEvmSignature } from '@polymarket/types';
import { describe, expect, it } from 'vitest';
import { minPerpsBuilderFeeRate } from '../../websockets/perps/actions/builder-terms';
import {
  createPerpsBuilderFeeApprovalBody,
  createPerpsBuilderFeeApprovalTypedData,
  nextPerpsBuilderApprovalVersion,
} from './builders';

const trader = expectEvmAddress('0x1111111111111111111111111111111111111111');
const builder = expectEvmAddress('0xabababababababababababababababababababab');
const otherBuilder = expectEvmAddress(
  '0x3333333333333333333333333333333333333333',
);

it('compares builder fee caps without losing decimal precision', () => {
  expect(minPerpsBuilderFeeRate('0.0003', '0.0005')).toBe('0.0003');
  expect(minPerpsBuilderFeeRate('0.0005', '0.0003')).toBe('0.0003');
  expect(minPerpsBuilderFeeRate('0.1000000000000000000000000001', '0.1')).toBe(
    '0.1',
  );
});

describe('nextPerpsBuilderApprovalVersion', () => {
  it('increments the saved version for the matching builder', () => {
    const approval = {
      trader,
      maxFeeRate: toDecimalString('0'),
      timestamp: toEpochMilliseconds(1_767_225_600_000),
      sequence: 1,
    };
    expect(
      nextPerpsBuilderApprovalVersion(
        [
          { ...approval, builder: otherBuilder, approvalVersion: 3 },
          { ...approval, builder, approvalVersion: 7 },
        ],
        '0xABABABABABABABABABABABABABABABABABABABAB',
      ),
    ).toBe(8);
  });
});

describe('builder fee approval payload', () => {
  it('signs and submits the same approval values', () => {
    const op = {
      chainId: 137,
      builder,
      maxFeeRate: '0.0005',
      approvalVersion: 4,
      salt: 42,
      timestamp: 1_767_225_600_000,
    };
    const signature = expectEvmSignature(`0x${'11'.repeat(65)}`);

    expect(createPerpsBuilderFeeApprovalTypedData(op).message).toEqual({
      data: '0x9b39a5811e1b82ef5fae336ec1cef34c98cb35f7268be852c350689a7a5ed0e4',
      salt: 42n,
      ts: 1_767_225_600_000n,
    });
    expect(createPerpsBuilderFeeApprovalBody(op, signature)).toEqual({
      op: {
        type: 'approveBuilder',
        args: {
          builder,
          max_fee_rate: '0.0005',
          approval_version: 4,
        },
      },
      salt: 42,
      sig: signature,
      ts: 1_767_225_600_000,
    });
  });
});
