import type {
  RequestAddressRequest,
  SignAuthMessageRequest,
  Signer,
  SignGaslessMessageRequest,
  SignGaslessTypedDataRequest,
  SignOrderRequest,
} from '@polymarket/client';
import { CancelledSigningError } from '@polymarket/client';
import type { EvmAddress, EvmSignature } from '@polymarket/types';

/**
 * A wallet-facing request yielded by a client workflow.
 *
 * @remarks
 * The React SDK supports Deposit Wallet and legacy Safe/Proxy accounts only,
 * whose operations execute through the gasless relayer, so the vocabulary is
 * signature-only: handlers never send transactions or pay gas.
 */
export type WorkflowRequest =
  | RequestAddressRequest
  | SignAuthMessageRequest
  | SignOrderRequest
  | SignGaslessTypedDataRequest
  | SignGaslessMessageRequest;

/**
 * The answer a {@link WorkflowHandler} produces for a {@link WorkflowRequest}.
 */
export type WorkflowResponse = EvmAddress | EvmSignature;

/**
 * Marker returned by `controls.cancel(...)` to abort a workflow cleanly.
 */
export class WorkflowCancelled {
  constructor(readonly reason?: string) {}
}

export type WorkflowHandlerControls = {
  /**
   * Cancels the workflow. Return the produced marker from the handler; the
   * hook settles with a `CancelledSigningError`, the same error wallet-side
   * rejections surface as.
   */
  cancel: (reason?: string) => WorkflowCancelled;
};

/**
 * Answers the wallet-facing requests yielded by client workflows.
 *
 * @remarks
 * This is the single interception point for wallet operations. Wallet entry
 * points such as `@polymarket/react/viem` provide a default implementation;
 * wrap it to confirm, decorate UI state, or cancel per step. Hooks narrow
 * `TRequest` to the request kinds their workflow can actually yield, and a
 * broad handler is assignable to any of them.
 */
export type WorkflowHandler<
  TRequest extends WorkflowRequest = WorkflowRequest,
> = (
  request: TRequest,
  controls: WorkflowHandlerControls,
) => Promise<WorkflowResponse | WorkflowCancelled>;

/**
 * Creates a {@link WorkflowHandler} from a wallet-library `Signer` adapter.
 *
 * @remarks
 * Wallet-agnostic core composed by the wallet entry points, such as
 * `useWorkflowHandler` from `@polymarket/react/viem`.
 *
 * @internal
 */
export function workflowHandlerFrom(signer: Signer): WorkflowHandler {
  return async function handle(request) {
    switch (request.kind) {
      case 'requestAddress':
        return signer.getAddress();
      case 'signAuthMessage':
      case 'signOrder':
      case 'signGaslessTypedData':
        return signer.signTypedData(request.payload);
      case 'signGaslessMessage':
        return signer.signMessage(request.payload);
    }
  };
}

const workflowControls: WorkflowHandlerControls = {
  cancel: (reason?: string) => new WorkflowCancelled(reason),
};

/**
 * Drives a client workflow to completion through a handler.
 *
 * @remarks
 * Each yielded request is answered by the handler; a `WorkflowCancelled`
 * marker aborts the workflow and throws `CancelledSigningError`, unifying
 * app-level cancellation with wallet-side rejection. Handler failures close
 * the workflow and rethrow.
 *
 * @internal
 */
export async function driveWorkflow<TRequest extends WorkflowRequest, TReturn>(
  workflow: AsyncGenerator<TRequest, TReturn, WorkflowResponse>,
  handler: WorkflowHandler<TRequest>,
  onStep?: (kind: TRequest['kind']) => void,
): Promise<TReturn> {
  let result = await workflow.next();

  while (!result.done) {
    onStep?.(result.value.kind);

    let response: WorkflowResponse | WorkflowCancelled;

    try {
      response = await handler(result.value, workflowControls);
    } catch (error) {
      await closeWorkflow(workflow);
      throw error;
    }

    if (response instanceof WorkflowCancelled) {
      await closeWorkflow(workflow);
      throw new CancelledSigningError(
        response.reason ?? 'The workflow was cancelled.',
      );
    }

    result = await workflow.next(response);
  }

  return result.value;
}

async function closeWorkflow(
  workflow: AsyncGenerator<unknown, unknown, unknown>,
): Promise<void> {
  try {
    await workflow.return(undefined);
  } catch {
    // Closing an already-settled workflow must not mask the original failure.
  }
}
