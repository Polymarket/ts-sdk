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
  it.each([
    {
      name: 'a full submillisecond bucket',
      end: 2000,
      expectedIds: Array.from({ length: 500 }, (_, index) => index + 1),
      timestamps: Array.from(
        { length: 500 },
        (_, index) => 1_000_000_500 - index,
      ),
    },
    {
      name: 'both inclusive edges of a one-millisecond page',
      end: 2000,
      expectedIds: Array.from({ length: 500 }, (_, index) => index + 1),
      timestamps: [
        1_001_000_000,
        ...Array.from({ length: 498 }, (_, index) => 1_000_000_498 - index),
        1_000_000_000,
      ],
    },
    {
      name: 'a full page exactly at the current end',
      end: 1001,
      expectedIds: Array.from({ length: 500 }, (_, index) => 500 - index),
      timestamps: Array<number>(500).fill(1_001_000_000),
    },
  ])('continues past $name without omissions or duplicates', async ({
    timestamps,
    end,
    expectedIds,
  }) => {
    const history = historyReader([
      ...timestamps,
      999_500_000,
      999_000_000,
      998_000_000,
    ]);
    const first = await history.page({
      ...initialState,
      startTimestamp: 999,
      endTimestamp: end,
    });
    expect(first.items).toHaveLength(500);

    // Resume the same cursor shape minted before this recovery existed.
    const recovered = await history.page(cursorState(first));
    const continuation = cursorState(recovered);
    expect(continuation.startTimestamp).toBe(999);
    expect(continuation.endTimestamp).toBe(1000);
    const last = await history.page(continuation);
    expect(last.hasMore).toBe(false);
    expect(
      [...first.items, ...recovered.items, ...last.items].map(
        (item) => item.transferId,
      ),
    ).toEqual([...expectedIds, 501, 502]);
    expect(history.calls).toEqual([
      [999, end],
      [999, 1001],
      [1000, 1001],
      [999, 1000],
    ]);
  });

  it('does not skip a hidden fractional row below a full exact-end page', async () => {
    const history = historyReader([
      ...Array<number>(500).fill(1_001_000_000),
      1_000_500_000,
      999_000_000,
    ]);
    const first = await history.page({ ...initialState, endTimestamp: 1001 });
    await expect(history.page(cursorState(first))).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
    expect(history.calls).toEqual([
      [0, 1001],
      [0, 1001],
      [1000, 1001],
    ]);
  });

  it.each([
    { timestamp: 1_000_000_001, start: 0, end: 2000, boundary: [1000, 1001] },
    { timestamp: 0, start: 0, end: 0, boundary: [0, 0] },
  ])('refuses an incomplete bounded interval at $timestamp', async ({
    timestamp,
    start,
    end,
    boundary,
  }) => {
    const history = historyReader([
      ...Array<number>(501).fill(timestamp),
      timestamp - 1,
    ]);
    const first = await history.page({
      ...initialState,
      startTimestamp: start,
      endTimestamp: end,
    });
    await expect(history.page(cursorState(first))).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
    expect(history.calls).toHaveLength(3);
    expect(history.calls.at(-1)).toEqual(boundary);
  });

  it('propagates a failed completeness read without advancing the cursor', async () => {
    const history = historyReader([
      ...Array<number>(500).fill(1_000_000_001),
      999_000_000,
    ]);
    const first = await history.page({ ...initialState, endTimestamp: 2000 });
    const state = cursorState(first);
    const response = await history.read(state);
    const failure = new Error('history read unavailable');
    await expect(
      toPerpsInternalTransfersPage(
        response.transfers,
        response.hasMore,
        state,
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);
    expect(state.endTimestamp).toBe(1001);
  });

  it.each([
    0, 2000,
  ])('keeps newly visible probe rows with start=%s', async (startTimestamp) => {
    const state = {
      ...initialState,
      startTimestamp,
      endTimestamp: 2000,
      seenKeys: ['1'],
    };
    const unseen = transfer(2, Math.max(startTimestamp, 1999));
    const recovered = await toPerpsInternalTransfersPage(
      [transfer(1, 2000)],
      true,
      state,
      async () => ({ transfers: [transfer(1, 2000), unseen], hasMore: false }),
    );
    expect(recovered.items).toEqual([unseen]);
    expect(recovered.hasMore).toBe(startTimestamp === 0);
    if (recovered.hasMore) {
      const last = await toPerpsInternalTransfersPage(
        [unseen, transfer(3, 1998)],
        false,
        cursorState(recovered),
        unexpectedBoundaryRead,
      );
      expect(last.items.map((item) => item.transferId)).toEqual([3]);
    } else {
      expect(recovered.nextCursor).toBeUndefined();
    }
  });

  it('retains unread submillisecond transfers across a page boundary', async () => {
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
      const page = await toPerpsInternalTransfersPage(
        matching
          .slice(0, 3)
          .map(({ id, timestamp }) =>
            transfer(id, Math.floor(timestamp / 1_000_000)),
          ),
        matching.length > 3,
        state,
        unexpectedBoundaryRead,
      );
      ids.push(...page.items.map((item) => item.transferId));
      if (!page.hasMore) break;
      state = cursorState(page);
    }
    expect(ids).toEqual([1, 2, 3, 4, 5]);
    expect(ends).toEqual([5000, 2001]);
  });

  it('deduplicates the inclusive upper edge of the overlapping millisecond', async () => {
    const first = await toPerpsInternalTransfersPage(
      [transfer(1, 2001), transfer(2, 2000)],
      true,
      initialState,
      unexpectedBoundaryRead,
    );
    const next = await toPerpsInternalTransfersPage(
      [transfer(1, 2001), transfer(2, 2000), transfer(3, 2000)],
      false,
      cursorState(first),
      unexpectedBoundaryRead,
    );
    expect(next.items.map((item) => item.transferId)).toEqual([3]);
    expect(next.hasMore).toBe(false);
  });

  it('continues within the inclusive start millisecond without widening the range', async () => {
    const state = { ...initialState, startTimestamp: 2000, endTimestamp: 2000 };
    const first = await toPerpsInternalTransfersPage(
      [transfer(1, 2000)],
      true,
      state,
      unexpectedBoundaryRead,
    );
    const nextState = cursorState(first);
    expect(nextState).toMatchObject({
      startTimestamp: 2000,
      endTimestamp: 2000,
    });
    const next = await toPerpsInternalTransfersPage(
      [transfer(1, 2000), transfer(2, 2000)],
      false,
      nextState,
      unexpectedBoundaryRead,
    );
    expect(next.items.map((item) => item.transferId)).toEqual([2]);
  });

  it('fails rather than skipping a full millisecond that cannot be advanced', async () => {
    const transfers = [transfer(1, 2000), transfer(2, 2000)];
    const readBoundary = async () => ({ transfers, hasMore: true });
    const first = await toPerpsInternalTransfersPage(
      transfers,
      true,
      initialState,
      readBoundary,
    );
    await expect(
      toPerpsInternalTransfersPage(
        transfers,
        true,
        cursorState(first),
        readBoundary,
      ),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it('rejects a missing continuation instead of silently ending history', async () => {
    await expect(
      toPerpsInternalTransfersPage(
        [],
        true,
        initialState,
        unexpectedBoundaryRead,
      ),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});

async function unexpectedBoundaryRead(): Promise<never> {
  throw new Error('Ordinary history pages should not need a completeness read');
}

function historyReader(timestamps: number[]) {
  const calls: number[][] = [];
  async function read(bounds: {
    startTimestamp: number;
    endTimestamp: number;
  }) {
    calls.push([bounds.startTimestamp, bounds.endTimestamp]);
    const matching = timestamps
      .map((timestamp, index) => ({ timestamp, id: index + 1 }))
      .sort(
        (left, right) => right.timestamp - left.timestamp || right.id - left.id,
      )
      .filter(
        ({ timestamp }) =>
          timestamp >= bounds.startTimestamp * 1_000_000 &&
          timestamp <= bounds.endTimestamp * 1_000_000,
      );
    return {
      transfers: matching
        .slice(0, 500)
        .map(({ timestamp, id }) =>
          transfer(id, Math.floor(timestamp / 1_000_000)),
        ),
      hasMore: matching.length > 500,
    };
  }
  return {
    calls,
    read,
    async page(state: PerpsInternalTransfersCursorState) {
      const response = await read(state);
      return toPerpsInternalTransfersPage(
        response.transfers,
        response.hasMore,
        state,
        read,
      );
    },
  };
}

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
