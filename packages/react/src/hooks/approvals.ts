import type { BaseSecureClient } from '@polymarket/client';
import type {
  PrepareTradingApprovalsError,
  SetupTradingApprovalsError,
} from '@polymarket/client/actions';
import { prepareTradingApprovals } from '@polymarket/client/actions';
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

export type UseSetupTradingApprovalsError =
  | PrepareTradingApprovalsError
  | SetupTradingApprovalsError
  | UnauthenticatedError;

export type UseSetupTradingApprovalsResult = [
  setupTradingApprovals: () => Promise<void>,
  state: WorkflowWriteResult<void, UseSetupTradingApprovalsError, GaslessStep>,
];

/**
 * Sets up the session account's trading approvals through the workflow
 * handler.
 *
 * @remarks
 * This is the recovery path for `InsufficientAllowanceError` order rejections
 * and the account-readiness step for fresh accounts. Approvals execute
 * through the gasless relayer, so the provider config needs an `apiKey` with
 * gasless support, such as `remoteBuilderSigning`. Approvals require a
 * deployed account wallet: on fresh Deposit Wallet accounts check
 * `useIsWalletDeployed` and run `useDeployWallet` first. Resolves once the
 * missing approvals are confirmed; resolves immediately when none are
 * missing. Failures surface on `error` and also reject the returned promise.
 *
 * @example
 * ```tsx
 * const handler = useWorkflowHandler(walletClient);
 * const [setupApprovals, { status }] = useSetupTradingApprovals(handler);
 *
 * return (
 *   <button disabled={status === 'pending'} onClick={() => setupApprovals()}>
 *     Enable trading
 *   </button>
 * );
 * ```
 */
export function useSetupTradingApprovals(
  handler: WorkflowHandler<GaslessStepRequest>,
): UseSetupTradingApprovalsResult {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const run = useCallback(
    async (client: BaseSecureClient, onStep: (kind: GaslessStep) => void) => {
      const workflow = await prepareTradingApprovals(client);

      return driveWorkflow(
        asGaslessWorkflow(workflow),
        handlerRef.current,
        onStep,
      );
    },
    [],
  );

  return useSecureWrite(run);
}
