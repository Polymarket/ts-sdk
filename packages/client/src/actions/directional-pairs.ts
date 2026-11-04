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
import { parseRequestOptions, type RequestOptions } from '../request-options';
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

/** A held middle-bucket YES position and the threshold wings it can restore. */
export type DirectionalBucketHolding = {
  positionId: PositionId;
  eventId: DirectionalEventId;
  bucketIndex: number;
  /** Fresh on-chain bucket balance, in six-decimal base units. */
  balance: bigint;
  /** pUSD needed to split the full balance; not capped by the wallet's collateral. */
  requiredPusd: bigint;
  abovePositionId: PositionId;
  belowPositionId: PositionId;
};

export type FindDirectionalBucketsRequest = {
  /** Optional protocol event ID, distinct from a catalog event ID. */
  eventId?: string;
};

const FindDirectionalBucketsRequestSchema = z.object({
  eventId: DirectionalEventIdSchema.optional(),
});

export type FindDirectionalBucketsError =
  | PaginationLimitError
  | RateLimitError
  | RequestAbortedError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FindDirectionalBucketsError = makeErrorGuard(
  PaginationLimitError,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Finds this wallet's indexed middle-bucket YES holdings, with fresh on-chain
 * balances. Excludes NO, Void, outer buckets and zero balances. Ranks holdings
 * by descending balance, then event and bucket index. Unindexed holdings cannot
 * be discovered. No transactions are submitted and no pUSD balance is read.
 *
 * Each result describes splitting that single bucket's entire balance into its
 * adjacent threshold wings. All amounts use six-decimal bigint base units.
 * requiredPusd reports the cost without checking affordability; split execution
 * validates the current collateral balance. Contiguous buckets can also be split
 * together, so per-bucket costs are not an optimal combined allocation.
 *
 * @example
 * ```ts
 * const buckets = await client.findDirectionalBuckets();
 * console.table(buckets);
 * ```
 * @throws {@link FindDirectionalBucketsError} Thrown on invalid input, read failure or incomplete pagination.
 */
export async function findDirectionalBuckets(
  client: BaseSecureClient,
  request: FindDirectionalBucketsRequest = {},
  options: RequestOptions = {},
): Promise<DirectionalBucketHolding[]> {
  const params = parseUserInput(request, FindDirectionalBucketsRequestSchema);
  const requestOptions = parseRequestOptions(options);
  return directionalBucketsFromHoldings(
    await readDirectionalHoldings(
      client,
      'bucket',
      params.eventId,
      requestOptions,
    ),
  );
}

/** Describes singleton splits from held bucket inventory without reading collateral. @internal */
export function directionalBucketsFromHoldings(
  holdings: readonly DirectionalHolding[],
): DirectionalBucketHolding[] {
  const buckets: DirectionalBucketHolding[] = [];
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
    buckets.push({
      positionId: holding.positionId,
      eventId: position.eventId,
      bucketIndex: position.index,
      balance: holding.balance,
      requiredPusd: holding.balance,
      abovePositionId: deriveThresholdPositionId(
        position.eventId,
        position.index,
        ThresholdSide.Above,
      ),
      belowPositionId: deriveThresholdPositionId(
        position.eventId,
        position.index + 1,
        ThresholdSide.Below,
      ),
    });
  }
  return buckets.sort((a, b) => {
    if (a.balance !== b.balance) return a.balance > b.balance ? -1 : 1;
    if (a.eventId !== b.eventId) return a.eventId < b.eventId ? -1 : 1;
    return a.bucketIndex - b.bucketIndex;
  });
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
  options: RequestOptions = {},
): Promise<DirectionalHolding[]> {
  const ids = new Set<PositionId>();
  for await (const page of listPositions(
    client,
    {
      user: client.account.wallet,
    },
    options,
  )) {
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
        options,
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
