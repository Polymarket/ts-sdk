import type { PositionId } from '@polymarket/bindings';
import {
  type DirectionalEventId,
  DirectionalEventIdSchema,
  DirectionalPositionIdSchema,
  decodeDirectionalInstrument,
} from '@polymarket/bindings/protocol';
import { z } from 'zod';
import {
  decodeErc1155BalanceOfBatchResult,
  erc1155BalanceOfBatchCall,
} from '../abis';
import type { BaseSecureClient } from '../clients';
import {
  makeErrorGuard,
  PaginationLimitError,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import { listPositions } from './portfolio';

/** An independently mergeable pair, sized in six-decimal base units. */
export type DirectionalPair = {
  eventId: DirectionalEventId;
  lowLine: number;
  highLine: number;
  abovePositionId: PositionId;
  belowPositionId: PositionId;
  amount: bigint;
  expectedPusd: bigint;
};

export type FindDirectionalPairsRequest = {
  /** Optional on-chain event ID, distinct from a catalog event ID. */
  eventId?: string;
};

const FindDirectionalPairsRequestSchema = z.object({
  eventId: DirectionalEventIdSchema.optional(),
});

export type FindDirectionalPairsError =
  | PaginationLimitError
  | RateLimitError
  | RequestAbortedError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FindDirectionalPairsError = makeErrorGuard(
  PaginationLimitError,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Finds collateral-return pairs in the authenticated wallet's indexed holdings.
 * Refreshes candidate balances on chain. Unindexed holdings cannot be discovered.
 * Pairs are alternatives: overlapping pairs share inventory and amounts cannot be summed.
 * No funds are moved. Merge preparation rechecks balances before submission.
 *
 * @throws {@link FindDirectionalPairsError} Thrown on failure or incomplete pagination.
 */
export async function findDirectionalPairs(
  client: BaseSecureClient,
  request: FindDirectionalPairsRequest = {},
): Promise<DirectionalPair[]> {
  const params = parseUserInput(request, FindDirectionalPairsRequestSchema);
  const ids = new Set<PositionId>();
  for await (const page of listPositions(client, {
    user: client.account.wallet,
  })) {
    for (const holding of page.items) {
      const parsed = DirectionalPositionIdSchema.safeParse(holding.assetId);
      if (!parsed.success) continue;
      const position = decodeDirectionalInstrument(parsed.data);
      if (
        position.kind === 'line' &&
        (!params.eventId || position.eventId === params.eventId)
      ) {
        ids.add(parsed.data);
      }
    }
    if (page.limitReached)
      throw new PaginationLimitError(
        'Cannot discover all directional holdings within the position listing limit',
      );
  }
  const candidates = [...ids];
  const holdings: DirectionalHolding[] = [];
  for (let start = 0; start < candidates.length; start += 200) {
    const chunk = candidates.slice(start, start + 200);
    const balances = decodeErc1155BalanceOfBatchResult(
      await client.rpc.ethCall(
        erc1155BalanceOfBatchCall(
          client.environment.contracts.positionManager,
          client.account.wallet,
          chunk,
        ),
      ),
    );
    if (balances.length !== chunk.length)
      throw new UnexpectedResponseError(
        'Expected one balance per directional position',
      );
    for (const [index, positionId] of chunk.entries()) {
      const balance = balances[index];
      if (balance !== undefined && balance > 0n)
        holdings.push({ positionId, balance });
    }
  }
  return directionalPairsFromHoldings(holdings);
}

type DirectionalHolding = { positionId: PositionId; balance: bigint };

/** @internal */
export function directionalPairsFromHoldings(
  holdings: readonly DirectionalHolding[],
): DirectionalPair[] {
  const positions = holdings.map((holding) => ({
    ...holding,
    ...decodeDirectionalInstrument(holding.positionId),
  }));
  const pairs: DirectionalPair[] = [];
  for (const low of positions) {
    if (low.kind !== 'line' || low.side !== 'above' || low.balance <= 0n)
      continue;
    for (const high of positions) {
      if (
        high.kind !== 'line' ||
        high.side !== 'below' ||
        high.balance <= 0n ||
        low.eventId !== high.eventId ||
        low.index >= high.index
      )
        continue;
      const amount = low.balance < high.balance ? low.balance : high.balance;
      pairs.push({
        eventId: low.eventId,
        lowLine: low.index,
        highLine: high.index,
        abovePositionId: low.positionId,
        belowPositionId: high.positionId,
        amount,
        expectedPusd: amount,
      });
    }
  }
  return pairs;
}
