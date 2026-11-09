import { describe, expectTypeOf, it } from 'vitest';
import {
  type DirectionalBucketHolding,
  type DirectionalBulkResult,
  type FindDirectionalBucketsRequest,
  type MergeDirectionalWorkflow,
  type PrepareComposeThresholdRequest,
  type PrepareConvertPositionRequest,
  type PrepareDecomposeThresholdRequest,
  type PrepareMergeEventPositionsRequest,
  type PrepareSplitEventPositionsRequest,
  type RequestOptions,
  type SecureWalletActions,
  type SplitDirectionalWorkflow,
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

    const invalidEventSplit = {
      eventId,
      // @ts-expect-error Splitting a complete event requires an explicit collateral amount.
      amount: 'max',
    } satisfies PrepareSplitEventPositionsRequest;
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
  it('discovers bucket holdings with an optional event filter and trailing read options', () => {
    function consume(
      client: SecureWalletActions,
      plainEventId: string,
      bucket: DirectionalBucketHolding,
    ) {
      const request = {
        eventId: plainEventId,
      } satisfies FindDirectionalBucketsRequest;
      const options = {
        signal: new AbortController().signal,
        retries: 0,
        timeout: 1_000,
      } satisfies RequestOptions;
      expectTypeOf(client.findDirectionalBuckets()).toEqualTypeOf<
        Promise<DirectionalBucketHolding[]>
      >();
      expectTypeOf(
        client.findDirectionalBuckets(request, options),
      ).toEqualTypeOf<Promise<DirectionalBucketHolding[]>>();
      expectTypeOf(
        client.findDirectionalBuckets(undefined, options),
      ).toEqualTypeOf<Promise<DirectionalBucketHolding[]>>();
      expectTypeOf(client.findDirectionalBuckets).parameters.toEqualTypeOf<
        [request?: FindDirectionalBucketsRequest, options?: RequestOptions]
      >();
      expectTypeOf(bucket.positionId).toMatchTypeOf<string>();
      expectTypeOf(bucket.eventId).toMatchTypeOf<string>();
      expectTypeOf(bucket.bucketIndex).toEqualTypeOf<number>();
      expectTypeOf(bucket.balance).toEqualTypeOf<bigint>();
      expectTypeOf(bucket.requiredPusd).toEqualTypeOf<bigint>();
      expectTypeOf(
        client.splitDirectional(
          bucket.abovePositionId,
          bucket.belowPositionId,
          bucket.balance,
        ),
      ).toEqualTypeOf<Promise<TransactionHandle>>();
      // @ts-expect-error An event filter accepts the plain string identifier, never a numeric catalog event ID.
      client.findDirectionalBuckets({ eventId: 123 });
    }
    expectTypeOf(consume).toBeFunction();
  });

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
      expectTypeOf(client.splitDirectional('123', '456', 1n)).toEqualTypeOf<
        Promise<TransactionHandle>
      >();
      expectTypeOf(client.mergeDirectional('123', '456', 'max')).toEqualTypeOf<
        Promise<TransactionHandle>
      >();
    }
    expectTypeOf(consume).toBeFunction();
  });

  it('accepts two plain position IDs in either order with optional base-unit amounts', () => {
    function consume(
      client: SecureWalletActions,
      positionIdA: string,
      positionIdB: string,
    ) {
      expectTypeOf(
        client.mergeDirectional(positionIdA, positionIdB),
      ).toEqualTypeOf<Promise<TransactionHandle>>();
      expectTypeOf(
        client.splitDirectional(positionIdB, positionIdA),
      ).toEqualTypeOf<Promise<TransactionHandle>>();
      expectTypeOf(
        client.mergeDirectional(positionIdB, positionIdA, 1_000_000n),
      ).toEqualTypeOf<Promise<TransactionHandle>>();
      expectTypeOf(
        client.splitDirectional(positionIdA, positionIdB, 'max'),
      ).toEqualTypeOf<Promise<TransactionHandle>>();
      expectTypeOf(
        client.prepareMergeDirectional(positionIdA, positionIdB),
      ).toEqualTypeOf<Promise<MergeDirectionalWorkflow>>();
      expectTypeOf(
        client.prepareMergeDirectional(positionIdB, positionIdA, 'max'),
      ).toEqualTypeOf<Promise<MergeDirectionalWorkflow>>();
      expectTypeOf(
        client.prepareSplitDirectional(positionIdB, positionIdA, 1n),
      ).toEqualTypeOf<Promise<SplitDirectionalWorkflow>>();
      expectTypeOf(
        client.prepareSplitDirectional(positionIdA, positionIdB),
      ).toEqualTypeOf<Promise<SplitDirectionalWorkflow>>();

      // @ts-expect-error Both position IDs are required.
      client.mergeDirectional(positionIdA);
      // @ts-expect-error Both position IDs are required.
      client.splitDirectional(positionIdA);
      // @ts-expect-error Amounts use bigint base units, never a number.
      client.mergeDirectional(positionIdA, positionIdB, 1);
      // @ts-expect-error Amounts use bigint base units, never a number.
      client.splitDirectional(positionIdA, positionIdB, 1);
      // @ts-expect-error The event/line request object has been replaced by two position IDs.
      client.mergeDirectional({ eventId, lowLine: 1, highLine: 3 });
      // @ts-expect-error The event/line request object has been replaced by two position IDs.
      client.splitDirectional({ eventId, lowLine: 1, highLine: 3 });
      // @ts-expect-error Custom signing also requires two position IDs.
      client.prepareMergeDirectional({ eventId, lowLine: 1, highLine: 3 });
      // @ts-expect-error Custom signing also requires bigint base units.
      client.prepareSplitDirectional(positionIdA, positionIdB, '1');
    }
    expectTypeOf(consume).toBeFunction();
  });

  it('processes directional wallet inventory without arguments and returns outcomes and errors', () => {
    function consume(client: SecureWalletActions) {
      expectTypeOf(client.mergeAllUserPositionsDirectional()).toEqualTypeOf<
        Promise<DirectionalBulkResult>
      >();
      expectTypeOf(client.splitAllUserPositionsDirectional()).toEqualTypeOf<
        Promise<DirectionalBulkResult>
      >();
      expectTypeOf(
        client.mergeAllUserPositionsDirectional,
      ).parameters.toEqualTypeOf<[]>();
      expectTypeOf(
        client.splitAllUserPositionsDirectional,
      ).parameters.toEqualTypeOf<[]>();

      // @ts-expect-error Wallet-wide merge discovers its own positions and accepts no arguments.
      client.mergeAllUserPositionsDirectional({ eventId });
      // @ts-expect-error Wallet-wide split discovers its own inventory and accepts no arguments.
      client.splitAllUserPositionsDirectional('123', '456', 'max');
    }
    expectTypeOf(consume).toBeFunction();
  });
});
