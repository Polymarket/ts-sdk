import { toPaginationCursor } from '@polymarket/bindings';
import type { PerpsInternalTransfer } from '@polymarket/bindings/perps';
import { UnexpectedResponseError } from '../../../errors';
import type { Page } from '../../../pagination';

/** @internal */
export type PerpsInternalTransfersCursorState = {
  kind: 'perpsInternalTransfers';
  startTimestamp: number;
  endTimestamp: number;
  seenKeys: string[];
};

/**
 * Keeps the entire final millisecond in the next query because transfer
 * timestamps lose submillisecond precision when normalized. The overlapping
 * records are retained in the cursor for deduplication.
 *
 * @internal
 */
export function toPerpsInternalTransfersPage(
  transfers: PerpsInternalTransfer[],
  hasMore: boolean,
  state: PerpsInternalTransfersCursorState,
): Page<PerpsInternalTransfer[]> {
  const seenKeys = new Set(state.seenKeys);
  const items = transfers.filter(
    (transfer) => !seenKeys.has(String(transfer.transferId)),
  );
  if (!hasMore) return { items, hasMore: false };

  const last = transfers.at(-1);
  if (last === undefined) {
    throw new UnexpectedResponseError(
      'Perps internal-transfer history reported more records without a continuation timestamp.',
    );
  }
  const endTimestamp = Math.min(state.endTimestamp, last.createdTimestamp + 1);
  if (endTimestamp === state.endTimestamp && items.length === 0) {
    throw new UnexpectedResponseError(
      'Perps internal-transfer history cannot continue within a full millisecond without skipping records.',
    );
  }

  // The inclusive upper bound may also repeat a record at the exact start
  // of the following millisecond. Keep that record in the overlap too.
  const nextSeenKeys = new Set(
    endTimestamp === state.endTimestamp ? state.seenKeys : [],
  );
  for (const transfer of transfers) {
    if (transfer.createdTimestamp >= endTimestamp - 1) {
      nextSeenKeys.add(String(transfer.transferId));
    }
  }
  return {
    items,
    hasMore: true,
    nextCursor: toPaginationCursor(
      btoa(
        JSON.stringify({
          ...state,
          endTimestamp,
          seenKeys: Array.from(nextSeenKeys),
        }),
      ),
    ),
  };
}
