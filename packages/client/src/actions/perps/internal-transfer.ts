import type { PerpsInternalTransferId } from '@polymarket/bindings/perps';
import type { EvmAddress, EvmSignature } from '@polymarket/types';

/** @internal */
export type PerpsCollateralTransferOperation = {
  account: EvmAddress;
  token: EvmAddress;
  recipient: EvmAddress;
  amount: string;
  salt: number;
  timestamp: number;
};

/** @internal */
export type SignedPerpsCollateralTransfer = PerpsCollateralTransferOperation & {
  signature: EvmSignature;
  label?: string;
};

/** @internal */
export type PerpsCollateralTransferExecutor = {
  signTransfer(
    operation: PerpsCollateralTransferOperation,
  ): Promise<EvmSignature>;
  submitTransfer(
    transfer: SignedPerpsCollateralTransfer,
  ): Promise<PerpsInternalTransferId>;
};

/** @internal */
export type PerpsCollateralTransfer = PerpsCollateralTransferOperation & {
  label?: string;
};

/**
 * Signs and submits one validated transfer. The label is unsigned metadata.
 * Failures propagate without retrying: a failed submission may have completed.
 *
 * @internal
 */
export async function executePerpsCollateralTransfer(
  executor: PerpsCollateralTransferExecutor,
  transfer: PerpsCollateralTransfer,
): Promise<PerpsInternalTransferId> {
  const { label, ...operation } = transfer;
  const signature = await executor.signTransfer(operation);
  return executor.submitTransfer({
    ...operation,
    signature,
    ...(label === undefined ? {} : { label }),
  });
}
