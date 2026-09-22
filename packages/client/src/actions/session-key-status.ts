import {
  RelayerAuthorizeSessionSignerStatus,
  RelayerRevokeSessionSignerStatus,
} from '@polymarket/bindings/relayer';
import { TransactionFailedError } from '../errors';

type SessionSignerOperation =
  | {
      kind: 'authorization';
      status: RelayerAuthorizeSessionSignerStatus;
    }
  | {
      kind: 'revocation';
      status: RelayerRevokeSessionSignerStatus;
    };

export function assertSessionSignerOperationAccepted(
  operation: SessionSignerOperation,
): void {
  const failed =
    operation.kind === 'authorization'
      ? operation.status === RelayerAuthorizeSessionSignerStatus.FAILED ||
        operation.status === RelayerAuthorizeSessionSignerStatus.SUPERSEDED ||
        operation.status === RelayerAuthorizeSessionSignerStatus.REPAIR_REQUIRED
      : operation.status === RelayerRevokeSessionSignerStatus.FAILED;

  if (failed) {
    throw new TransactionFailedError(
      `Session-key ${operation.kind} reached terminal status ${operation.status}`,
    );
  }
}
