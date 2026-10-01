import { describe, expectTypeOf, it } from 'vitest';
import type {
  ConvertWorkflow,
  HorizontalMergeWorkflow,
  HorizontalSplitWorkflow,
  PrepareConvertRequest,
  PrepareHorizontalMergeRequest,
  PrepareHorizontalSplitRequest,
  SecureClient,
  TransactionHandle,
} from '../index';

declare const client: SecureClient;

describe('neg-risk client public API', () => {
  it('only requests signing steps for the prepared operation', async () => {
    const request = { eventId: '0x02...', amount: 1_000_000n };
    const conversion = await client.prepareConvert({
      ...request,
      conditionIndex: 0,
    });
    const conversionStep = await conversion.next();
    if (!conversionStep.done) {
      expectTypeOf(conversionStep.value.kind).toEqualTypeOf<
        | 'requestAddress'
        | 'signGaslessMessage'
        | 'signGaslessTypedData'
        | 'sendConvertTransaction'
      >();
    }

    const split = await client.prepareHorizontalSplit(request);
    const splitStep = await split.next();
    if (!splitStep.done) {
      expectTypeOf(splitStep.value.kind).toEqualTypeOf<
        | 'requestAddress'
        | 'signGaslessMessage'
        | 'signGaslessTypedData'
        | 'sendHorizontalSplitTransaction'
      >();
    }

    const merge = await client.prepareHorizontalMerge(request);
    const mergeStep = await merge.next();
    if (!mergeStep.done) {
      expectTypeOf(mergeStep.value.kind).toEqualTypeOf<
        | 'requestAddress'
        | 'signGaslessMessage'
        | 'signGaslessTypedData'
        | 'sendHorizontalMergeTransaction'
      >();
    }
  });

  it('accepts plain event IDs and exposes prepare and complete methods at the root', () => {
    const convert: PrepareConvertRequest = {
      eventId: '0x02...',
      conditionIndex: 0,
      amount: 1_000_000n,
    };
    const split: PrepareHorizontalSplitRequest = {
      eventId: '0x02...',
      amount: 1_000_000n,
    };
    const merge: PrepareHorizontalMergeRequest = split;
    expectTypeOf(client.convert(convert)).toEqualTypeOf<
      Promise<TransactionHandle>
    >();
    expectTypeOf(client.horizontalSplit(split)).toEqualTypeOf<
      Promise<TransactionHandle>
    >();
    expectTypeOf(client.horizontalMerge(merge)).toEqualTypeOf<
      Promise<TransactionHandle>
    >();
    expectTypeOf(client.prepareConvert(convert)).toEqualTypeOf<
      Promise<ConvertWorkflow>
    >();
    expectTypeOf(client.prepareHorizontalSplit(split)).toEqualTypeOf<
      Promise<HorizontalSplitWorkflow>
    >();
    expectTypeOf(client.prepareHorizontalMerge(merge)).toEqualTypeOf<
      Promise<HorizontalMergeWorkflow>
    >();
    // @ts-expect-error These operations require an explicit amount.
    client.horizontalMerge({ eventId: '0x02...', amount: 'max' });
  });
});
