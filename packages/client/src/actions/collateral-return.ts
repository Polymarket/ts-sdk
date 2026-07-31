import type { EvmAddress } from '@polymarket/bindings';
import {
  type CollateralReturnPlanResponse,
  CollateralReturnPlanResponseSchema,
  CollateralReturnPlanSchema,
} from '@polymarket/bindings/combos';
import { WalletType } from '@polymarket/bindings/gamma';
import {
  type RelayerDepositWalletExecuteRequest,
  RelayerExecuteResponseSchema,
  type RelayerLegacyExecuteRequest,
  RelayerTransactionType,
} from '@polymarket/bindings/relayer';
import {
  delay,
  type EvmSignature,
  type HexString,
  invariant,
  isSameEvmAddress,
  type NonEmptyArray,
  unwrap,
} from '@polymarket/types';
import { z } from 'zod';
import type { BaseSecureClient } from '../clients';
import {
  CancelledSigningError,
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import { validateWith } from '../response';
import type { TransactionCall, TransactionHandle } from '../types';
import { completeWith } from '../workflow';
import {
  buildDepositWalletExecuteRequest,
  buildProxyWalletExecuteRequest,
  buildSafeWalletExecuteRequest,
  extractOnChainNonceFromSubmitError,
  GaslessTransactionHandle,
  type GaslessWorkflowRequest,
  isRetryableGaslessSubmitError,
  resignDepositWalletExecuteRequest,
} from './gasless';

export {
  CollateralReturnKnownOperationKind,
  type CollateralReturnOperation,
  type CollateralReturnOperationKind,
  type CollateralReturnPlanResponse,
  type CollateralReturnPositionAmount,
  type CollateralReturnPositionSummary,
  type CollateralReturnRouterCall,
} from '@polymarket/bindings/combos';

// Planning and submit re-validation both recompute wallet state server-side
// and can take well beyond the transport's standard timeout.
const COLLATERAL_RETURN_REQUEST_TIMEOUT_MS = 2 * 60_000;

export type PlanCollateralReturnError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError;
export const PlanCollateralReturnError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
);

/**
 * Plans a collateral return for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link PlanCollateralReturnError}
 * Thrown on failure.
 */
export async function planCollateralReturn(
  client: BaseSecureClient,
): Promise<CollateralReturnPlanResponse> {
  assertCollateralReturnAccount(client);

  return unwrap(
    client.combos
      .post('/v1/collateral-return/plan', {
        json: { wallet: client.account.wallet },
        timeout: COLLATERAL_RETURN_REQUEST_TIMEOUT_MS,
      })
      .andThen(validateWith(CollateralReturnPlanResponseSchema)),
  );
}

const ExecuteCollateralReturnPlanRequestSchema = z.object({
  plan: CollateralReturnPlanSchema,
});

export type ExecuteCollateralReturnPlanRequest = z.infer<
  typeof ExecuteCollateralReturnPlanRequestSchema
>;

export type CollateralReturnExecutionWorkflow = AsyncGenerator<
  GaslessWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

const COLLATERAL_RETURN_SUBMIT_RETRY_ATTEMPTS = 10;
const COLLATERAL_RETURN_METADATA = 'Collateral return';

export type PrepareCollateralReturnExecutionError =
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareCollateralReturnExecutionError = makeErrorGuard(
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Starts a collateral return execution workflow for a previously requested
 * plan.
 *
 * The workflow signs and submits the exact call carried by the plan.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link PrepareCollateralReturnExecutionError}
 * Thrown on failure.
 */
export async function prepareCollateralReturnExecution(
  client: BaseSecureClient,
  request: ExecuteCollateralReturnPlanRequest,
): Promise<CollateralReturnExecutionWorkflow> {
  const { plan } = parseUserInput(
    request,
    ExecuteCollateralReturnPlanRequestSchema,
  );

  invariant(
    client.supportsGasless,
    'Collateral return execution requires a Relayer API Key or Builder API Key in the client configuration.',
  );
  assertCollateralReturnAccount(client);

  if (!isSameEvmAddress(plan.wallet, client.account.wallet)) {
    throw new UserInputError(
      'The collateral return plan was created for a different wallet than the authenticated account.',
    );
  }

  if (plan.chainId !== client.environment.chainId) {
    throw new UserInputError(
      `The collateral return plan was created for chain ${plan.chainId}, but the client is configured for chain ${client.environment.chainId}.`,
    );
  }

  return async function* (): CollateralReturnExecutionWorkflow {
    const calls: NonEmptyArray<TransactionCall> = [
      {
        data: plan.routerCall.data,
        to: plan.routerCall.to,
        value: 0n,
      },
    ];

    for (
      let attempt = 0;
      attempt <= COLLATERAL_RETURN_SUBMIT_RETRY_ATTEMPTS;
      attempt += 1
    ) {
      try {
        const envelope = yield* buildCollateralReturnEnvelope(client, calls);

        try {
          return await submitCollateralReturnPlan(
            client,
            plan.planHash,
            envelope,
          );
        } catch (error) {
          const nonce = extractOnChainNonceFromSubmitError(error);
          if (
            nonce === undefined ||
            envelope.type !== RelayerTransactionType.WALLET
          ) {
            throw error;
          }

          const resignedEnvelope = yield* resignDepositWalletExecuteRequest(
            client,
            envelope,
            calls,
            nonce,
          );

          return await submitCollateralReturnPlan(
            client,
            plan.planHash,
            resignedEnvelope,
          );
        }
      } catch (error) {
        if (
          !isRetryableGaslessSubmitError(error) ||
          attempt === COLLATERAL_RETURN_SUBMIT_RETRY_ATTEMPTS
        ) {
          throw error;
        }

        await delay(client.environment.relayerPollFrequencyMs);
      }
    }

    invariant(false, 'Expected collateral return submit retry loop to return');
  }.call(null);
}

export type ExecuteCollateralReturnPlanError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError
  | CancelledSigningError
  | SigningError;
export const ExecuteCollateralReturnPlanError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Executes a collateral return plan for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ExecuteCollateralReturnPlanError}
 * Thrown on failure.
 */
export function executeCollateralReturnPlan(
  client: BaseSecureClient,
  request: ExecuteCollateralReturnPlanRequest,
): Promise<TransactionHandle> {
  return prepareCollateralReturnExecution(client, request).then(
    completeWith(client.signer),
  );
}

function assertCollateralReturnAccount(client: BaseSecureClient): void {
  invariant(
    client.account.walletType === WalletType.DEPOSIT_WALLET ||
      client.account.walletType === WalletType.GNOSIS_SAFE ||
      client.account.walletType === WalletType.POLY_PROXY,
    'Collateral return supports Deposit Wallet, Safe Wallet, and Proxy Wallet accounts',
  );
}

type CollateralReturnEnvelope =
  | RelayerDepositWalletExecuteRequest
  | RelayerLegacyExecuteRequest;

function buildCollateralReturnEnvelope(
  client: BaseSecureClient,
  calls: NonEmptyArray<TransactionCall>,
): AsyncGenerator<
  GaslessWorkflowRequest,
  CollateralReturnEnvelope,
  EvmAddress | EvmSignature | TransactionHandle
> {
  switch (client.account.walletType) {
    case WalletType.GNOSIS_SAFE:
      return buildSafeWalletExecuteRequest(
        client,
        calls,
        COLLATERAL_RETURN_METADATA,
      );
    case WalletType.POLY_PROXY:
      return buildProxyWalletExecuteRequest(
        client,
        calls,
        COLLATERAL_RETURN_METADATA,
      );
    default:
      return buildDepositWalletExecuteRequest(
        client,
        calls,
        COLLATERAL_RETURN_METADATA,
      );
  }
}

async function submitCollateralReturnPlan(
  client: BaseSecureClient,
  planHash: HexString,
  envelope: CollateralReturnEnvelope,
): Promise<TransactionHandle> {
  const response = await unwrap(
    client.combos
      .post('/v1/collateral-return/submit', {
        json: { envelope, plan_hash: planHash },
        timeout: COLLATERAL_RETURN_REQUEST_TIMEOUT_MS,
      })
      .andThen(validateWith(RelayerExecuteResponseSchema)),
  );

  return new GaslessTransactionHandle(client, response);
}
