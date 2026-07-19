import type { BaseSecureClient, TransactionOutcome } from '@polymarket/client';
import type {
  DeployDepositWalletError,
  IsWalletDeployedError,
  WaitForGaslessTransactionError,
} from '@polymarket/client/actions';
import {
  deployDepositWallet,
  isWalletDeployed,
} from '@polymarket/client/actions';
import { useCallback } from 'react';
import type { UnauthenticatedError } from '../errors';
import type { ReadResult } from '../read';
import { useSecureClientAction } from '../read';
import type { WriteResult } from '../write';
import { useSecureWrite } from '../write';

type EmptyRequest = Record<string, never>;

function isWalletDeployedAction(
  client: BaseSecureClient,
  _request: EmptyRequest,
): Promise<boolean> {
  return isWalletDeployed(client);
}

/**
 * Fetches whether the session account wallet is deployed on-chain.
 *
 * @remarks
 * Pauses until a session is active. A fresh Deposit Wallet account starts
 * undeployed: reads work, but on-chain operations such as trading approvals
 * require deployment first — deploy with `useDeployWallet` and `refetch`
 * after it confirms. Errors surface on `error` as
 * {@link IsWalletDeployedError}.
 *
 * @example
 * ```tsx
 * const { data: isDeployed, refetch } = useIsWalletDeployed();
 * ```
 */
export function useIsWalletDeployed(): ReadResult<
  boolean,
  IsWalletDeployedError
> {
  return useSecureClientAction<EmptyRequest, boolean, IsWalletDeployedError>(
    isWalletDeployedAction,
    {},
  );
}

export type UseDeployWalletError =
  | DeployDepositWalletError
  | WaitForGaslessTransactionError
  | UnauthenticatedError;

export type UseDeployWalletResult = [
  deployWallet: () => Promise<TransactionOutcome>,
  state: WriteResult<TransactionOutcome, UseDeployWalletError>,
];

/**
 * Deploys the session account's Deposit Wallet on-chain.
 *
 * @remarks
 * Deployment is signature-free — it executes through the gasless relayer, so
 * no workflow handler is needed but the provider config requires an `apiKey`
 * with gasless support. Run it before `useSetupTradingApprovals` on fresh
 * accounts; check the need with `useIsWalletDeployed`. Resolves once the
 * deployment transaction is confirmed. Only Deposit Wallet accounts deploy
 * through this path; legacy Safe/Proxy accounts are already deployed.
 * Failures surface on `error` and also reject the returned promise.
 *
 * @example
 * ```tsx
 * const { data: isDeployed, refetch } = useIsWalletDeployed();
 * const [deploy, { status }] = useDeployWallet();
 *
 * return isDeployed === false ? (
 *   <button
 *     disabled={status === 'pending'}
 *     onClick={() => deploy().then(() => refetch())}
 *   >
 *     Activate account
 *   </button>
 * ) : null;
 * ```
 */
export function useDeployWallet(): UseDeployWalletResult {
  const run = useCallback(
    async (client: BaseSecureClient, _onStep: (kind: never) => void) => {
      const handle = await deployDepositWallet(client);

      return handle.wait();
    },
    [],
  );

  const [execute, state] = useSecureWrite<
    [],
    TransactionOutcome,
    UseDeployWalletError
  >(run);

  return [
    execute,
    {
      status: state.status,
      data: state.data,
      error: state.error,
      reset: state.reset,
    },
  ];
}
