import type { BaseSecureClient, TransactionOutcome } from '@polymarket/client';
import type {
  PrepareErc20TransferRequest,
  TransferErc20Error,
  WaitForGaslessTransactionError,
} from '@polymarket/client/actions';
import { prepareErc20Transfer } from '@polymarket/client/actions';
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

export type UseTransferError =
  | TransferErc20Error
  | WaitForGaslessTransactionError
  | UnauthenticatedError;

export type UseTransferResult = [
  transfer: (
    request: PrepareErc20TransferRequest,
  ) => Promise<TransactionOutcome>,
  state: WorkflowWriteResult<TransactionOutcome, UseTransferError, GaslessStep>,
];

/**
 * Transfers an ERC-20 token, such as USDC, out of the session account — the
 * withdraw/cash-out operation.
 *
 * @remarks
 * Executes through the gasless relayer, so the provider config needs an
 * `apiKey` with gasless support. Resolves once the transfer transaction is
 * confirmed. Failures surface on `error` and also reject the returned
 * promise.
 *
 * @example
 * ```tsx
 * const handler = useWorkflowHandler(walletClient);
 * const [transfer, { status }] = useTransfer(handler);
 *
 * await transfer({ amount, to: destination, tokenAddress });
 * ```
 */
export function useTransfer(
  handler: WorkflowHandler<GaslessStepRequest>,
): UseTransferResult {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const run = useCallback(
    async (
      client: BaseSecureClient,
      onStep: (kind: GaslessStep) => void,
      request: PrepareErc20TransferRequest,
    ) => {
      const workflow = await prepareErc20Transfer(client, request);
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
