import type {
  RelayerDepositWalletExecuteRequest,
  RelayerLegacyExecuteRequest,
} from '@polymarket/bindings/relayer';
import {
  delay,
  type EvmAddress,
  type EvmSignature,
  invariant,
} from '@polymarket/types';
import type { TransactionHandle } from '../../types';
import type { GaslessWorkflow, GaslessWorkflowRequest } from '../gasless';
import {
  extractOnChainNonceFromSubmitError,
  isRetryableGaslessSubmitError,
} from './submit-errors';

type GaslessEnvelope =
  | RelayerDepositWalletExecuteRequest
  | RelayerLegacyExecuteRequest;
type EnvelopeWorkflow<T> = AsyncGenerator<
  GaslessWorkflowRequest,
  T,
  EvmAddress | EvmSignature | TransactionHandle
>;

type GaslessSubmission = {
  build: () => EnvelopeWorkflow<GaslessEnvelope>;
  submit: (envelope: GaslessEnvelope) => Promise<TransactionHandle>;
  resign?: (
    envelope: GaslessEnvelope,
    nonce: string,
  ) => EnvelopeWorkflow<GaslessEnvelope>;
};

/** Rebuilds transiently rejected submissions, with one corrected-nonce re-sign per attempt. */
export async function* submitGaslessWorkflow(
  submission: GaslessSubmission,
  retryAttempts: number,
  retryDelayMs: number,
): GaslessWorkflow {
  for (let attempt = 0; attempt <= retryAttempts; attempt += 1) {
    try {
      const envelope = yield* submission.build();
      try {
        return await submission.submit(envelope);
      } catch (error) {
        const nonce = extractOnChainNonceFromSubmitError(error);
        if (nonce === undefined || submission.resign === undefined) throw error;
        const resigned = yield* submission.resign(envelope, nonce);
        return await submission.submit(resigned);
      }
    } catch (error) {
      if (!isRetryableGaslessSubmitError(error) || attempt === retryAttempts)
        throw error;
      await delay(retryDelayMs);
    }
  }
  invariant(false, 'Expected gasless submission retry loop to return');
}
