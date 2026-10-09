import { describe, expectTypeOf, it } from 'vitest';
import {
  type PrepareComposeThresholdRequest,
  type PrepareConvertPositionRequest,
  type PrepareDecomposeThresholdRequest,
  type PrepareMergeDirectionalPositionsRequest,
  type PrepareMergeEventPositionsRequest,
  type PrepareSplitDirectionalPositionsRequest,
  type PrepareSplitEventPositionsRequest,
  type SecureWalletActions,
  ThresholdSide,
  type TransactionHandle,
} from '../index';

const eventId = '0x0400112233445566778899aabbccddeeff000400000000000000000000';

describe('directional public input types', () => {
  it('accepts plain protocol identifiers and separates split amounts from balance snapshots', () => {
    const plainEventId: string = eventId;
    const plainPositionId: string = '123';
    const eventMerge = {
      eventId: plainEventId,
      amount: 'max',
    } satisfies PrepareMergeEventPositionsRequest;
    const conversion = {
      positionId: plainPositionId,
      amount: 1n,
    } satisfies PrepareConvertPositionRequest;
    void eventMerge;
    void conversion;

    const split = {
      eventId,
      lowLine: 1,
      highLine: 3,
      amount: 1n,
    } satisfies PrepareSplitDirectionalPositionsRequest;
    const invalidSplit = {
      eventId,
      lowLine: 1,
      highLine: 3,
      // @ts-expect-error Splitting consumes collateral and requires an explicit amount.
      amount: 'max',
    } satisfies PrepareSplitDirectionalPositionsRequest;
    const invalidEventSplit = {
      eventId,
      // @ts-expect-error Splitting a complete event requires an explicit collateral amount.
      amount: 'max',
    } satisfies PrepareSplitEventPositionsRequest;
    void split;
    void invalidSplit;
    void invalidEventSplit;
  });

  it('uses the exported threshold-side enum for both threshold operations', () => {
    expectTypeOf<PrepareDecomposeThresholdRequest>().toEqualTypeOf<PrepareComposeThresholdRequest>();
    const compose = {
      eventId,
      line: 2,
      side: ThresholdSide.Above,
      amount: 'max',
    } satisfies PrepareComposeThresholdRequest;
    const decompose = {
      eventId,
      line: 2,
      side: ThresholdSide.Below,
      amount: 1n,
    } satisfies PrepareDecomposeThresholdRequest;
    const invalidSide = {
      eventId,
      line: 2,
      // @ts-expect-error Pass a ThresholdSide enum member.
      side: 'ABOVE',
      amount: 1n,
    } satisfies PrepareComposeThresholdRequest;
    void compose;
    void decompose;
    void invalidSide;
  });
});

describe('directional wallet method types', () => {
  it('returns a transaction handle from each method', () => {
    function consume(client: SecureWalletActions) {
      const eventSplit: PrepareSplitEventPositionsRequest = {
        eventId,
        amount: 1n,
      };
      const eventMerge: PrepareMergeEventPositionsRequest = {
        eventId,
        amount: 'max',
      };
      const conversion: PrepareConvertPositionRequest = {
        positionId: '123',
        amount: 'max',
      };
      const threshold: PrepareComposeThresholdRequest = {
        eventId,
        line: 2,
        side: ThresholdSide.Below,
        amount: 'max',
      };
      const directionalSplit: PrepareSplitDirectionalPositionsRequest = {
        eventId,
        lowLine: 1,
        highLine: 3,
        amount: 1n,
      };
      const directionalMerge: PrepareMergeDirectionalPositionsRequest = {
        eventId,
        lowLine: 1,
        highLine: 3,
        amount: 'max',
      };

      expectTypeOf(client.splitEventPositions(eventSplit)).toEqualTypeOf<
        Promise<TransactionHandle>
      >();
      expectTypeOf(client.mergeEventPositions(eventMerge)).toEqualTypeOf<
        Promise<TransactionHandle>
      >();
      expectTypeOf(client.convertPosition(conversion)).toEqualTypeOf<
        Promise<TransactionHandle>
      >();
      expectTypeOf(client.composeThreshold(threshold)).toEqualTypeOf<
        Promise<TransactionHandle>
      >();
      expectTypeOf(client.decomposeThreshold(threshold)).toEqualTypeOf<
        Promise<TransactionHandle>
      >();
      expectTypeOf(
        client.splitDirectionalPositions(directionalSplit),
      ).toEqualTypeOf<Promise<TransactionHandle>>();
      expectTypeOf(
        client.mergeDirectionalPositions(directionalMerge),
      ).toEqualTypeOf<Promise<TransactionHandle>>();
    }
    expectTypeOf(consume).toBeFunction();
  });
});
