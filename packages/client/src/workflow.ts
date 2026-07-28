import type { EvmAddress, EvmSignature, HexString } from '@polymarket/types';
import { CancelledSigningError, makeErrorGuard, SigningError } from './errors';
import type {
  Signer,
  SignerTransactionRequest,
  TransactionCall,
  TransactionHandle,
  TypedDataPayload,
} from './types';

export type RequestAddressRequest = {
  kind: 'requestAddress';
};

export type SignAuthMessageRequest = {
  kind: 'signAuthMessage';
  payload: TypedDataPayload;
};

export type SendErc20ApprovalTransactionRequest = {
  kind: 'sendErc20ApprovalTransaction';
  request: SignerTransactionRequest;
};

export type SendErc1155ApprovalForAllTransactionRequest = {
  kind: 'sendErc1155ApprovalForAllTransaction';
  request: SignerTransactionRequest;
};

export type SendErc20TransferTransactionRequest = {
  kind: 'sendErc20TransferTransaction';
  request: SignerTransactionRequest;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type SendPerpsDepositTransactionRequest = {
  kind: 'sendPerpsDepositTransaction';
  request: SignerTransactionRequest;
};

export type SignGaslessTypedDataRequest = {
  kind: 'signGaslessTypedData';
  payload: TypedDataPayload;
};

export type SignGaslessMessageRequest = {
  kind: 'signGaslessMessage';
  payload: HexString;
};

export type SendSplitPositionTransactionRequest = {
  kind: 'sendSplitPositionTransaction';
  request: SignerTransactionRequest;
};

export type SendMergePositionsTransactionRequest = {
  kind: 'sendMergePositionsTransaction';
  request: SignerTransactionRequest;
};

export type SendRedeemPositionsTransactionRequest = {
  kind: 'sendRedeemPositionsTransaction';
  request: SignerTransactionRequest;
};

export type SignOrderRequest = {
  kind: 'signOrder';
  payload: TypedDataPayload;
};

export type AuthenticationWorkflowRequest =
  | RequestAddressRequest
  | SignAuthMessageRequest;

export type AuthenticationWorkflow<TReturn> = AsyncGenerator<
  AuthenticationWorkflowRequest,
  TReturn,
  EvmAddress | EvmSignature
>;

export type AuthenticateWith = <TReturn>(
  workflow: AuthenticationWorkflow<TReturn>,
) => Promise<TReturn>;

export type AuthenticateWithError = CancelledSigningError | SigningError;
export const AuthenticateWithError = makeErrorGuard(
  CancelledSigningError,
  SigningError,
);
export type CompleteWithError = CancelledSigningError | SigningError;
export const CompleteWithError = makeErrorGuard(
  CancelledSigningError,
  SigningError,
);

export type CompleteWorkflowRequest =
  | RequestAddressRequest
  | SendErc20ApprovalTransactionRequest
  | SendErc1155ApprovalForAllTransactionRequest
  | SendErc20TransferTransactionRequest
  | SendPerpsDepositTransactionRequest
  | SignGaslessTypedDataRequest
  | SignGaslessMessageRequest
  | SendSplitPositionTransactionRequest
  | SendMergePositionsTransactionRequest
  | SendRedeemPositionsTransactionRequest
  | SignOrderRequest;

export type CompleteWorkflowNext =
  | EvmAddress
  | EvmSignature
  | TransactionHandle;

export type CompleteWith = <TRequest extends CompleteWorkflowRequest, TReturn>(
  workflow: AsyncGenerator<TRequest, TReturn, CompleteWorkflowNext>,
) => Promise<TReturn>;

/** @internal */
export function authenticateWith(signer: Signer): AuthenticateWith {
  return async function authenticate(workflow) {
    let result = await workflow.next();

    while (!result.done) {
      try {
        switch (result.value.kind) {
          case 'requestAddress':
            result = await workflow.next(await signer.getAddress());
            break;
          case 'signAuthMessage':
            result = await workflow.next(
              await signer.signTypedData(result.value.payload),
            );
            break;
        }
      } catch (error) {
        result = await workflow.throw(error);
      }
    }

    return result.value;
  };
}

/** @internal */
export function completeWith(signer: Signer): CompleteWith {
  return async function complete(workflow) {
    let result = await workflow.next();

    while (!result.done) {
      try {
        switch (result.value.kind) {
          case 'requestAddress':
            result = await workflow.next(await signer.getAddress());
            break;

          case 'signGaslessTypedData':
          case 'signOrder':
            result = await workflow.next(
              await signer.signTypedData(result.value.payload),
            );
            break;

          case 'signGaslessMessage':
            result = await workflow.next(
              await signer.signMessage(result.value.payload),
            );
            break;

          case 'sendErc20ApprovalTransaction':
          case 'sendErc1155ApprovalForAllTransaction':
          case 'sendErc20TransferTransaction':
          case 'sendPerpsDepositTransaction':
          case 'sendMergePositionsTransaction':
          case 'sendRedeemPositionsTransaction':
          case 'sendSplitPositionTransaction':
            result = await workflow.next(
              await signer.sendTransaction(result.value.request),
            );
            break;
        }
      } catch (error) {
        result = await workflow.throw(error);
      }
    }

    return result.value;
  };
}

export function requestAddress(): RequestAddressRequest {
  return {
    kind: 'requestAddress',
  };
}

export function signerTransactionRequest(
  chainId: number,
  call: TransactionCall,
): SignerTransactionRequest {
  return {
    chainId,
    ...call,
  };
}
