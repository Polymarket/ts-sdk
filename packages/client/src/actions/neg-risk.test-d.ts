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
    const request = { conditionId: '0x02...', amount: 1_000_000n };
    const conversion = await client.prepareConvert(request);
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

  it('accepts market condition IDs for all prepared and complete operations', () => {
    const convert: PrepareConvertRequest = {
      conditionId: '0x02...',
      amount: 1_000_000n,
    };
    const split: PrepareHorizontalSplitRequest = {
      conditionId: '0x02...',
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
    client.horizontalMerge({ conditionId: '0x02...', amount: 'max' });
    // @ts-expect-error High-level conversion derives protocol inputs from a market condition.
    client.convert({ eventId: '0x02...', conditionIndex: 0, amount: 1n });
    // @ts-expect-error A separate index could contradict the selected condition.
    client.prepareConvert({ ...convert, conditionIndex: 0 });
    // @ts-expect-error High-level horizontal split accepts a condition ID.
    client.horizontalSplit({ eventId: '0x02...', amount: 1n });
    // @ts-expect-error High-level horizontal merge accepts a condition ID.
    client.horizontalMerge({ eventId: '0x02...', amount: 1n });
    // @ts-expect-error Prepared split accepts a condition ID.
    client.prepareHorizontalSplit({ eventId: '0x02...', amount: 1n });
    // @ts-expect-error Prepared merge accepts a condition ID.
    client.prepareHorizontalMerge({ eventId: '0x02...', amount: 1n });
  });
});
