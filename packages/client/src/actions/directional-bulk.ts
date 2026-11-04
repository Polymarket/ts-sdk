import type { PositionId } from '@polymarket/bindings';
import type { BaseSecureClient } from '../clients';
import {
  CancelledSigningError,
  makeErrorGuard,
  PaginationLimitError,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import type { TransactionOutcome } from '../types';
import { mergeDirectional, splitDirectional } from './directional';
import {
  findDirectionalPairs,
  findDirectionalSplitPairs,
} from './directional-pairs';

export type MergeAllUserPositionsDirectionalError =
  | CancelledSigningError
  | PaginationLimitError
  | RateLimitError
  | RequestAbortedError
  | RequestRejectedError
  | SigningError
  | TimeoutError
  | TransactionFailedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const MergeAllUserPositionsDirectionalError = makeErrorGuard(
  CancelledSigningError,
  PaginationLimitError,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Returns collateral from this wallet's discoverable directional threshold pairs.
 * Chooses the largest collateral return, waits for confirmation, then rediscovers
 * using fresh balances until no pair remains. Uses existing trading approvals.
 * Selection is greedy and does not guarantee a globally optimal allocation.
 * Unindexed holdings cannot be discovered. On error, execution stops and earlier
 * confirmed transactions remain effective. Returns their outcomes on success.
 *
 * @example
 * ```ts
 * const outcomes = await client.mergeAllUserPositionsDirectional();
 * ```
 * @throws {@link MergeAllUserPositionsDirectionalError} Thrown on discovery, signing, submission or confirmation failure.
 */
export function mergeAllUserPositionsDirectional(
  client: BaseSecureClient,
): Promise<TransactionOutcome[]> {
  return executeDirectionalPairs({
    discover() {
      return findDirectionalPairs(client);
    },
    async execute(pair) {
      const transaction = await mergeDirectional(
        client,
        pair.abovePositionId,
        pair.belowPositionId,
        pair.amount,
      );
      return transaction.wait();
    },
  });
}

export type SplitAllUserPositionsDirectionalError =
  | CancelledSigningError
  | PaginationLimitError
  | RateLimitError
  | RequestAbortedError
  | RequestRejectedError
  | SigningError
  | TimeoutError
  | TransactionFailedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const SplitAllUserPositionsDirectionalError = makeErrorGuard(
  CancelledSigningError,
  PaginationLimitError,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Spends available collateral and discoverable middle-bucket YES inventory to
 * restore directional threshold pairs. Chooses the largest feasible amount,
 * preferring the widest range on ties. Waits for confirmation and rediscovers
 * until no eligible range or collateral remains. Uses existing trading approvals.
 * Does not recover collateral or reproduce a particular previous merge.
 * Unindexed holdings cannot be discovered. Selection is greedy, not globally
 * optimal. On error, execution stops; earlier confirmed transactions persist.
 * Returns confirmed transaction outcomes on success.
 *
 * @example
 * ```ts
 * const outcomes = await client.splitAllUserPositionsDirectional();
 * ```
 * @throws {@link SplitAllUserPositionsDirectionalError} Thrown on discovery, signing, submission or confirmation failure.
 */
export function splitAllUserPositionsDirectional(
  client: BaseSecureClient,
): Promise<TransactionOutcome[]> {
  return executeDirectionalPairs({
    discover() {
      return findDirectionalSplitPairs(client);
    },
    async execute(pair) {
      const transaction = await splitDirectional(
        client,
        pair.abovePositionId,
        pair.belowPositionId,
        pair.amount,
      );
      return transaction.wait();
    },
  });
}

type DirectionalExecutionPair = {
  abovePositionId: PositionId;
  belowPositionId: PositionId;
  amount: bigint;
};

/** Executes ranked directional candidates sequentially, rediscovering after confirmation. @internal */
export async function executeDirectionalPairs(operations: {
  discover(): Promise<DirectionalExecutionPair[]>;
  execute(pair: DirectionalExecutionPair): Promise<TransactionOutcome>;
}): Promise<TransactionOutcome[]> {
  const outcomes: TransactionOutcome[] = [];
  while (true) {
    const [pair] = await operations.discover();
    if (!pair) return outcomes;
    outcomes.push(await operations.execute(pair));
  }
}
