import type { BaseSecureClient, TransactionOutcome } from '@polymarket/client';
import type {
  MergePositionsError,
  PrepareMergeMarketPositionRequest,
  PrepareRedeemMarketPositionsRequest,
  PrepareSplitMarketPositionRequest,
  RedeemPositionsError,
  SplitPositionError,
  WaitForGaslessTransactionError,
} from '@polymarket/client/actions';
import {
  prepareMergeMarketPosition,
  prepareRedeemMarketPositions,
  prepareSplitMarketPosition,
} from '@polymarket/client/actions';
import { useCallback, useRef } from 'react';
import type { UnauthenticatedError } from '../errors';
import type {
  GaslessStep,
  GaslessStepRequest,
  WorkflowHandler,
} from '../workflow';
import { asGaslessWorkflow, driveWorkflow } from '../workflow';
import type { WorkflowWriteResult } from '../write';
import { useSecureWrite } from '../write';

export type UseRedeemPositionsError =
  | RedeemPositionsError
  | WaitForGaslessTransactionError
  | UnauthenticatedError;

export type UseRedeemPositionsResult = [
  redeemPositions: (
    request: PrepareRedeemMarketPositionsRequest,
  ) => Promise<TransactionOutcome>,
  state: WorkflowWriteResult<
    TransactionOutcome,
    UseRedeemPositionsError,
    GaslessStep
  >,
];

/**
 * Redeems the session account's positions in a resolved market — the "claim
 * winnings" operation.
 *
 * @remarks
 * Executes through the gasless relayer, so the provider config needs an
 * `apiKey` with gasless support. Resolves once the redemption transaction is
 * confirmed. Failures surface on `error` and also reject the returned
 * promise.
 *
 * @example
 * ```tsx
 * const handler = useWorkflowHandler(walletClient);
 * const [redeem, { status }] = useRedeemPositions(handler);
 *
 * return (
 *   <button
 *     disabled={status === 'pending'}
 *     onClick={() => redeem({ conditionId })}
 *   >
 *     Claim winnings
 *   </button>
 * );
 * ```
 */
export function useRedeemPositions(
  handler: WorkflowHandler<GaslessStepRequest>,
): UseRedeemPositionsResult {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const run = useCallback(
    async (
      client: BaseSecureClient,
      onStep: (kind: GaslessStep) => void,
      request: PrepareRedeemMarketPositionsRequest,
    ) => {
      const workflow = await prepareRedeemMarketPositions(client, request);
      const handle = await driveWorkflow(
        asGaslessWorkflow(workflow),
        handlerRef.current,
        onStep,
      );

      return handle.wait();
    },
    [],
  );

  return useSecureWrite(run);
}

export type UseSplitPositionError =
  | SplitPositionError
  | WaitForGaslessTransactionError
  | UnauthenticatedError;

export type UseSplitPositionResult = [
  splitPosition: (
    request: PrepareSplitMarketPositionRequest,
  ) => Promise<TransactionOutcome>,
  state: WorkflowWriteResult<
    TransactionOutcome,
    UseSplitPositionError,
    GaslessStep
  >,
];

/**
 * Splits collateral into a full set of the session account's outcome tokens.
 *
 * @remarks
 * Executes through the gasless relayer, so the provider config needs an
 * `apiKey` with gasless support. Resolves once the split transaction is
 * confirmed. Failures surface on `error` and also reject the returned
 * promise.
 *
 * @example
 * ```tsx
 * const handler = useWorkflowHandler(walletClient);
 * const [split, { status }] = useSplitPosition(handler);
 *
 * await split({ conditionId, amount: 100 });
 * ```
 */
export function useSplitPosition(
  handler: WorkflowHandler<GaslessStepRequest>,
): UseSplitPositionResult {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const run = useCallback(
    async (
      client: BaseSecureClient,
      onStep: (kind: GaslessStep) => void,
      request: PrepareSplitMarketPositionRequest,
    ) => {
      const workflow = await prepareSplitMarketPosition(client, request);
      const handle = await driveWorkflow(
        asGaslessWorkflow(workflow),
        handlerRef.current,
        onStep,
      );

      return handle.wait();
    },
    [],
  );

  return useSecureWrite(run);
}

export type UseMergePositionsError =
  | MergePositionsError
  | WaitForGaslessTransactionError
  | UnauthenticatedError;

export type UseMergePositionsResult = [
  mergePositions: (
    request: PrepareMergeMarketPositionRequest,
  ) => Promise<TransactionOutcome>,
  state: WorkflowWriteResult<
    TransactionOutcome,
    UseMergePositionsError,
    GaslessStep
  >,
];

/**
 * Merges a full set of the session account's outcome tokens back into
 * collateral.
 *
 * @remarks
 * Executes through the gasless relayer, so the provider config needs an
 * `apiKey` with gasless support. Resolves once the merge transaction is
 * confirmed. Failures surface on `error` and also reject the returned
 * promise.
 *
 * @example
 * ```tsx
 * const handler = useWorkflowHandler(walletClient);
 * const [merge, { status }] = useMergePositions(handler);
 *
 * await merge({ conditionId, amount: 100 });
 * ```
 */
export function useMergePositions(
  handler: WorkflowHandler<GaslessStepRequest>,
): UseMergePositionsResult {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const run = useCallback(
    async (
      client: BaseSecureClient,
      onStep: (kind: GaslessStep) => void,
      request: PrepareMergeMarketPositionRequest,
    ) => {
      const workflow = await prepareMergeMarketPosition(client, request);
      const handle = await driveWorkflow(
        asGaslessWorkflow(workflow),
        handlerRef.current,
        onStep,
      );

      return handle.wait();
    },
    [],
  );

  return useSecureWrite(run);
}
