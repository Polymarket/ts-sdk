import { signerFrom } from '@polymarket/client/viem';
import { PolymarketError } from '@polymarket/types';
import { useMemo, useRef } from 'react';
import type { WalletClient } from 'viem';
import type { WorkflowHandler } from './workflow';
import { workflowHandlerFrom } from './workflow';

/**
 * Thrown when a workflow operation runs while no viem `WalletClient` is
 * available, such as before the wallet has (re)connected.
 */
export class WalletClientUnavailableError extends PolymarketError {
  override name = 'WalletClientUnavailableError' as const;

  constructor() {
    super(
      'No viem `WalletClient` is available. Connect a wallet before performing this operation.',
    );
  }
}

/**
 * Creates a {@link WorkflowHandler} from a viem `WalletClient`.
 *
 * @remarks
 * Always returns a stable handler, even while the wallet client is still
 * `undefined` (wagmi's `useWalletClient` resolves asynchronously). Invoking
 * the handler without a connected wallet client fails with
 * {@link WalletClientUnavailableError}, which propagates through the hook
 * operation that drove the workflow, such as `authenticate()`. Wrap the
 * returned handler for finer control over individual workflow steps.
 *
 * @example
 * ```tsx
 * const { data: walletClient } = useWalletClient();
 * const handler = useWorkflowHandler(walletClient);
 *
 * const { authenticate, status } = useAuthentication(handler);
 * ```
 */
export function useWorkflowHandler(
  walletClient: WalletClient | undefined,
): WorkflowHandler {
  const walletClientRef = useRef(walletClient);
  walletClientRef.current = walletClient;

  return useMemo(() => {
    const handler: WorkflowHandler = (request, controls) => {
      const current = walletClientRef.current;

      if (current === undefined) {
        return Promise.reject(new WalletClientUnavailableError());
      }

      return workflowHandlerFrom(signerFrom(current))(request, controls);
    };

    return handler;
  }, []);
}
