import type { PositionId } from '@polymarket/bindings';
import {
  type DirectionalEventId,
  DirectionalEventIdSchema,
  DirectionalPositionIdSchema,
  decodeDirectionalInstrument,
  deriveThresholdPositionId,
  ThresholdSide,
} from '@polymarket/bindings/protocol';
import { z } from 'zod';
import {
  decodeErc20BalanceOfResult,
  decodeErc1155BalanceOfBatchResult,
  erc20BalanceOfCall,
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
 * Candidates are ranked by descending collateral returned.
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
  return directionalPairsFromHoldings(
    await readDirectionalHoldings(client, 'line', params.eventId),
  );
}

/** @internal */
export type DirectionalSplitPair = {
  eventId: DirectionalEventId;
  lowLine: number;
  highLine: number;
  abovePositionId: PositionId;
  belowPositionId: PositionId;
  amount: bigint;
};

/** @internal */
export async function findDirectionalSplitPairs(
  client: BaseSecureClient,
  excludedPairs: ReadonlySet<string> = new Set(),
): Promise<DirectionalSplitPair[]> {
  const [holdings, collateral] = await Promise.all([
    readDirectionalHoldings(client, 'bucket'),
    client.rpc.ethCall(
      erc20BalanceOfCall(
        client.environment.contracts.collateralToken,
        client.account.wallet,
      ),
    ),
  ]);
  return directionalSplitPairsFromHoldings(
    holdings,
    decodeErc20BalanceOfResult(collateral),
    excludedPairs,
  );
}

type DirectionalHolding = { positionId: PositionId; balance: bigint };

async function readDirectionalHoldings(
  client: BaseSecureClient,
  kind: 'line' | 'bucket',
  eventId?: DirectionalEventId,
): Promise<DirectionalHolding[]> {
  const ids = new Set<PositionId>();
  for await (const page of listPositions(client, {
    user: client.account.wallet,
  })) {
    for (const holding of page.items) {
      const parsed = DirectionalPositionIdSchema.safeParse(holding.assetId);
      if (!parsed.success) continue;
      const position = decodeDirectionalInstrument(parsed.data);
      if (
        position.kind === kind &&
        (kind === 'line' || position.side === 'yes') &&
        (!eventId || position.eventId === eventId)
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
  return holdings;
}

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
  return pairs.sort(compareDirectionalPairs);
}

/** @internal */
export function directionalSplitPairsFromHoldings(
  holdings: readonly DirectionalHolding[],
  collateral: bigint,
  excludedPairs: ReadonlySet<string> = new Set(),
): DirectionalSplitPair[] {
  if (collateral <= 0n) return [];
  const events = new Map<DirectionalEventId, Map<number, bigint>>();
  let maximumAmount = 0n;
  const amounts = new Set<bigint>();
  for (const holding of holdings) {
    const position = decodeDirectionalInstrument(holding.positionId);
    if (
      position.kind !== 'bucket' ||
      position.side !== 'yes' ||
      position.index < 1 ||
      position.index >= position.bucketCount - 1 ||
      holding.balance <= 0n
    )
      continue;
    let buckets = events.get(position.eventId);
    if (!buckets) {
      buckets = new Map();
      events.set(position.eventId, buckets);
    }
    buckets.set(position.index, holding.balance);
    const amount = holding.balance < collateral ? holding.balance : collateral;
    if (amount > maximumAmount) maximumAmount = amount;
    if (excludedPairs.size > 0) amounts.add(amount);
  }

  const levels =
    excludedPairs.size > 0
      ? [...amounts].sort((first, second) =>
          first > second ? -1 : first < second ? 1 : 0,
        )
      : [maximumAmount];
  for (const amount of levels) {
    let best: DirectionalPairRange | undefined;
    const candidates: DirectionalPairRange[] = [];
    const queued = new Set<string>();
    for (const [eventId, buckets] of events) {
      for (const [lowLine, balance] of buckets) {
        if (balance < amount || (buckets.get(lowLine - 1) ?? 0n) >= amount)
          continue;
        // At each feasible amount, a maximal contiguous run dominates its
        // subranges until that exact pair is excluded.
        let highLine = lowLine + 1;
        while ((buckets.get(highLine) ?? 0n) >= amount) highLine++;
        const candidate = { eventId, lowLine, highLine, amount };
        if (!best || compareDirectionalPairs(candidate, best) < 0)
          best = candidate;
        if (excludedPairs.size > 0) {
          candidates.push(candidate);
          queued.add(`${eventId}:${lowLine}:${highLine}`);
        }
      }
    }
    if (excludedPairs.size === 0) return best ? [splitPairFromRange(best)] : [];
    while (candidates.length > 0) {
      candidates.sort(compareDirectionalPairs);
      const candidate = candidates.shift();
      if (!candidate) break;
      const pair = splitPairFromRange(candidate);
      if (!excludedPairs.has(`${pair.abovePositionId}:${pair.belowPositionId}`))
        return [pair];
      // Excluding one pair preserves smaller overlapping ranges. Expand only
      // excluded winners, so live holdings never generate every possible range.
      if (candidate.highLine - candidate.lowLine <= 1) continue;
      for (const child of [
        { ...candidate, lowLine: candidate.lowLine + 1 },
        { ...candidate, highLine: candidate.highLine - 1 },
      ]) {
        const key = `${child.eventId}:${child.lowLine}:${child.highLine}`;
        if (!queued.has(key)) {
          queued.add(key);
          candidates.push(child);
        }
      }
    }
  }
  return [];
}

type DirectionalPairRange = {
  eventId: DirectionalEventId;
  lowLine: number;
  highLine: number;
  amount: bigint;
};

function splitPairFromRange(range: DirectionalPairRange): DirectionalSplitPair {
  return {
    ...range,
    abovePositionId: deriveThresholdPositionId(
      range.eventId,
      range.lowLine,
      ThresholdSide.Above,
    ),
    belowPositionId: deriveThresholdPositionId(
      range.eventId,
      range.highLine,
      ThresholdSide.Below,
    ),
  };
}

function compareDirectionalPairs(
  first: DirectionalPairRange,
  second: DirectionalPairRange,
): number {
  if (first.amount !== second.amount)
    return first.amount > second.amount ? -1 : 1;
  const width =
    second.highLine - second.lowLine - (first.highLine - first.lowLine);
  if (width !== 0) return width;
  if (first.eventId !== second.eventId)
    return first.eventId < second.eventId ? -1 : 1;
  return first.lowLine - second.lowLine || first.highLine - second.highLine;
}
