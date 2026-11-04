import type { PositionId, TransactionId } from '@polymarket/bindings';
import type { TxHash } from '@polymarket/types';
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
import type { TransactionHandle, TransactionOutcome } from '../types';
import { completeWith } from '../workflow';
import {
  prepareMergeDirectional,
  prepareSplitDirectional,
} from './directional';
import {
  findDirectionalPairs,
  findDirectionalSplitPairs,
} from './directional-pairs';

/** Known operational errors captured in the bulk result; unknown errors may also be reported. */
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
 * Unindexed holdings cannot be discovered. Returns confirmed outcomes and errors.
 * Failed pairs are skipped; uncertain transactions pause further submissions.
 *
 * @example
 * ```ts
 * const { outcomes, errors } = await client.mergeAllUserPositionsDirectional();
 * ```
 * Operational failures are reported in the returned errors array.
 */
export function mergeAllUserPositionsDirectional(
  client: BaseSecureClient,
): Promise<DirectionalBulkResult> {
  return executeDirectionalPairs({
    discover() {
      return findDirectionalPairs(client);
    },
    async prepare(pair) {
      const workflow = await prepareMergeDirectional(
        client,
        pair.abovePositionId,
        pair.belowPositionId,
        pair.amount,
      );
      return {
        submit() {
          return completeWith(client.signer)(workflow);
        },
      };
    },
  });
}

/** Known operational errors captured in the bulk result; unknown errors may also be reported. */
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
 * optimal. Returns confirmed outcomes and errors; failed pairs are skipped.
 * Uncertain transactions pause submissions, and confirmed transactions persist.
 *
 * @example
 * ```ts
 * const { outcomes, errors } = await client.splitAllUserPositionsDirectional();
 * ```
 * Operational failures are reported in the returned errors array.
 */
export function splitAllUserPositionsDirectional(
  client: BaseSecureClient,
): Promise<DirectionalBulkResult> {
  return executeDirectionalPairs({
    discover(excludedPairs) {
      return findDirectionalSplitPairs(client, excludedPairs);
    },
    async prepare(pair) {
      const workflow = await prepareSplitDirectional(
        client,
        pair.abovePositionId,
        pair.belowPositionId,
        pair.amount,
      );
      return {
        submit() {
          return completeWith(client.signer)(workflow);
        },
      };
    },
  });
}

/** One operational failure captured while processing directional inventory. */
export type DirectionalBulkFailure =
  | { phase: 'discovery' | 'limit'; error: unknown }
  | {
      phase: 'preparation' | 'submission' | 'confirmation';
      abovePositionId: PositionId;
      belowPositionId: PositionId;
      amount: bigint;
      transactionHash: TxHash | null;
      transactionId: TransactionId | null;
      /** True when the transaction may still execute; new submissions have paused. */
      uncertain: boolean;
      error: unknown;
    };

/** Confirmed transactions and failures from a directional bulk operation. */
export type DirectionalBulkResult = {
  outcomes: TransactionOutcome[];
  errors: DirectionalBulkFailure[];
};

type DirectionalExecutionPair = {
  abovePositionId: PositionId;
  belowPositionId: PositionId;
  amount: bigint;
};

/** Executes ranked candidates, skipping definite failures and preserving uncertain submissions. @internal */
export async function executeDirectionalPairs(operations: {
  discover(
    excludedPairs: ReadonlySet<string>,
  ): Promise<DirectionalExecutionPair[]>;
  prepare(
    pair: DirectionalExecutionPair,
  ): Promise<{ submit(): Promise<TransactionHandle> }>;
}): Promise<DirectionalBulkResult> {
  const result: DirectionalBulkResult = { outcomes: [], errors: [] };
  const excludedPairs = new Set<string>();
  while (true) {
    if (excludedPairs.size >= 25) {
      result.errors.push({
        phase: 'limit',
        error: new Error('Stopped after 25 failed directional pairs'),
      });
      return result;
    }
    let pairs: DirectionalExecutionPair[];
    try {
      pairs = await retryDirectionalRead(() =>
        operations.discover(excludedPairs),
      );
    } catch (error) {
      result.errors.push({ phase: 'discovery', error });
      return result;
    }
    const pair = pairs.find(
      (candidate) => !excludedPairs.has(directionalPairKey(candidate)),
    );
    if (!pair) return result;
    let transaction: TransactionHandle;
    let phase: 'preparation' | 'submission' = 'preparation';
    try {
      const prepared = await retryDirectionalRead(() =>
        operations.prepare(pair),
      );
      phase = 'submission';
      transaction = await prepared.submit();
    } catch (error) {
      const uncertain =
        phase === 'submission' &&
        !isDefiniteDirectionalFailure(error) &&
        !(error instanceof CancelledSigningError);
      result.errors.push({
        ...pair,
        phase,
        error,
        uncertain,
        transactionHash: null,
        transactionId: null,
      });
      if (uncertain || error instanceof CancelledSigningError) return result;
      excludedPairs.add(directionalPairKey(pair));
      continue;
    }
    try {
      result.outcomes.push(
        await retryDirectionalRead(() => transaction.wait()),
      );
    } catch (error) {
      const uncertain = !(error instanceof TransactionFailedError);
      result.errors.push({
        ...pair,
        phase: 'confirmation',
        error,
        uncertain,
        transactionHash: transaction.transactionHash,
        transactionId: transaction.transactionId,
      });
      if (uncertain) return result;
      excludedPairs.add(directionalPairKey(pair));
    }
  }
}

function directionalPairKey(pair: DirectionalExecutionPair): string {
  return `${pair.abovePositionId}:${pair.belowPositionId}`;
}

function isDefiniteDirectionalFailure(error: unknown): boolean {
  return (
    error instanceof UserInputError ||
    error instanceof TransactionFailedError ||
    error instanceof RateLimitError ||
    (error instanceof RequestRejectedError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 408)
  );
}

async function retryDirectionalRead<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      const transient =
        error instanceof TransportError ||
        error instanceof TimeoutError ||
        error instanceof RateLimitError ||
        (error instanceof RequestRejectedError &&
          (error.status >= 500 || error.status === 408));
      const retryAfter =
        error instanceof RateLimitError || error instanceof RequestRejectedError
          ? (error.retryAfter ?? 0) * 1000
          : 0;
      if (!transient || attempt >= 2 || retryAfter > 5000) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(250 * 2 ** attempt, retryAfter)),
      );
    }
  }
}
