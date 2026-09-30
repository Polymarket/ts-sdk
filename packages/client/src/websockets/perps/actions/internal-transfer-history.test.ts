import { toDecimalString, toEpochMilliseconds } from '@polymarket/bindings';
import {
  type PerpsInternalTransfer,
  PerpsInternalTransferDirection,
  type PerpsInternalTransferId,
} from '@polymarket/bindings/perps';
import { expectEvmAddress, expectPresent } from '@polymarket/types';
import { describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../../../errors';
import type { Page } from '../../../pagination';
import {
  type PerpsInternalTransfersCursorState,
  toPerpsInternalTransfersPage,
} from './internal-transfer-history';

const initialState: PerpsInternalTransfersCursorState = {
  kind: 'perpsInternalTransfers',
  startTimestamp: 0,
  endTimestamp: 5000,
  seenKeys: [],
};

describe('internal-transfer history continuation', () => {
  it('retains unread submillisecond transfers across a page boundary', () => {
    // The history query filters nanoseconds, but returned records truncate to
    // milliseconds. A small page exercises the same boundary as the 500-row cap.
    const timestamps = [
      4_000_100_000, 3_000_100_000, 2_000_900_000, 2_000_500_000, 1_000_500_000,
    ];
    let state = initialState;
    const ids: number[] = [];
    const ends: number[] = [];
    for (let pageNumber = 0; pageNumber < 3; pageNumber++) {
      ends.push(state.endTimestamp);
      const matching = timestamps
        .map((timestamp, index) => ({ timestamp, id: index + 1 }))
        .filter(
          ({ timestamp }) =>
            timestamp >= state.startTimestamp * 1_000_000 &&
            timestamp <= state.endTimestamp * 1_000_000,
        );
      const page = toPerpsInternalTransfersPage(
        matching
          .slice(0, 3)
          .map(({ id, timestamp }) =>
            transfer(id, Math.floor(timestamp / 1_000_000)),
          ),
        matching.length > 3,
        state,
      );
      ids.push(...page.items.map((item) => item.transferId));
      if (!page.hasMore) break;
      state = cursorState(page);
    }
    expect(ids).toEqual([1, 2, 3, 4, 5]);
    expect(ends).toEqual([5000, 2001]);
  });

  it('deduplicates the inclusive upper edge of the overlapping millisecond', () => {
    const first = toPerpsInternalTransfersPage(
      [transfer(1, 2001), transfer(2, 2000)],
      true,
      initialState,
    );
    const next = toPerpsInternalTransfersPage(
      [transfer(1, 2001), transfer(2, 2000), transfer(3, 2000)],
      false,
      cursorState(first),
    );
    expect(next.items.map((item) => item.transferId)).toEqual([3]);
    expect(next.hasMore).toBe(false);
  });

  it('continues within the inclusive start millisecond without widening the range', () => {
    const state = { ...initialState, startTimestamp: 2000, endTimestamp: 2000 };
    const first = toPerpsInternalTransfersPage(
      [transfer(1, 2000)],
      true,
      state,
    );
    const nextState = cursorState(first);
    expect(nextState).toMatchObject({
      startTimestamp: 2000,
      endTimestamp: 2000,
    });
    const next = toPerpsInternalTransfersPage(
      [transfer(1, 2000), transfer(2, 2000)],
      false,
      nextState,
    );
    expect(next.items.map((item) => item.transferId)).toEqual([2]);
  });

  it('fails rather than skipping a full millisecond that cannot be advanced', () => {
    const transfers = [transfer(1, 2000), transfer(2, 2000)];
    const first = toPerpsInternalTransfersPage(transfers, true, initialState);
    expect(() =>
      toPerpsInternalTransfersPage(transfers, true, cursorState(first)),
    ).toThrow(UnexpectedResponseError);
  });

  it('rejects a missing continuation instead of silently ending history', () => {
    expect(() => toPerpsInternalTransfersPage([], true, initialState)).toThrow(
      UnexpectedResponseError,
    );
  });
});

function cursorState(
  page: Page<PerpsInternalTransfer[]>,
): PerpsInternalTransfersCursorState {
  return JSON.parse(atob(expectPresent(page.nextCursor)));
}

function transfer(id: number, timestamp: number): PerpsInternalTransfer {
  return {
    transferId: id as PerpsInternalTransferId,
    type: 'transfer',
    asset: 'USDC',
    amount: toDecimalString('1'),
    direction: PerpsInternalTransferDirection.Out,
    counterparty: expectEvmAddress(
      '0x0000000000000000000000000000000000000002',
    ),
    label: undefined,
    createdTimestamp: toEpochMilliseconds(timestamp),
  };
}
