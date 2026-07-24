import type { DecimalString, EvmAddress } from '@polymarket/bindings';
import {
  type CollateralReturnOperation,
  type CollateralReturnPlanResponse,
  CollateralReturnPlanResponseSchema,
  type CollateralReturnPositionAmount,
  type CollateralReturnPositionSummary,
  type CollateralReturnRouterCall,
} from '@polymarket/bindings/combos';
import { WalletType } from '@polymarket/bindings/gamma';
import {
  type RelayerDepositWalletExecuteRequest,
  RelayerExecuteResponseSchema,
  type RelayerLegacyExecuteRequest,
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
import { validateWith } from '../response';
import type { TransactionCall, TransactionHandle } from '../types';
import { completeWith } from '../workflow';
import {
  buildDepositWalletExecuteRequest,
  buildProxyWalletExecuteRequest,
  buildSafeWalletExecuteRequest,
  GaslessTransactionHandle,
  type GaslessWorkflowRequest,
  isRetryableGaslessSubmitError,
} from './gasless';

export {
  CollateralReturnKnownOperationKind,
  type CollateralReturnOperation,
  type CollateralReturnOperationKind,
  type CollateralReturnPositionAmount,
  type CollateralReturnPositionSummary,
  type CollateralReturnRouterCall,
} from '@polymarket/bindings/combos';

/**
 * An inspectable collateral return plan.
 *
 * A plan is a client-held execution artifact computed from a snapshot of the
 * account's positions: it describes how much collateral the plan releases,
 * the inputs the wallet must provide, and the exact call that executing the
 * plan submits. Inspect the returned amounts and residual-position impact,
 * and apply any application-specific limits, before executing.
 */
export type CollateralReturnPlan = {
  /** Opaque plan identifier, round-tripped when the plan is executed. */
  planHash: HexString;
  /** Wallet the plan was computed for. */
  wallet: EvmAddress;
  /** Chain the plan executes on. */
  chainId: number;
  /** Block the plan's snapshot was computed at. */
  blockNumber: bigint;
  /** Collateral balance before the plan executes. */
  startingCollateral: DecimalString;
  /** Net collateral the plan releases to the wallet. */
  collateralReturned: DecimalString;
  /** Collateral balance after the plan executes. */
  finalCollateral: DecimalString;
  /**
   * Collateral the wallet must hold, and have approved, to fund the plan's
   * intermediate operations.
   */
  requiredCollateral: DecimalString;
  /** Positions the wallet must provide to fund the plan's operations. */
  requiredPositions: CollateralReturnPositionAmount[];
  /**
   * Net position impact of the plan: the positions it consumes and the
   * residual positions it creates.
   */
  positionSummary: CollateralReturnPositionSummary;
  /** Ordered operations the plan performs. */
  operations: CollateralReturnOperation[];
  /**
   * Whether the plan reached the operation limit and is one executable chunk
   * of a larger return. Execute and confirm the chunk, then request a fresh
   * plan for the remainder.
   */
  truncated: boolean;
  /** Exact call executing the plan submits. */
  routerCall: CollateralReturnRouterCall;
};

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
): Promise<CollateralReturnPlan> {
  assertCollateralReturnAccount(client);

  const response = await unwrap(
    client.combos
      .post('/v1/collateral-return/plan', {
        json: { wallet: client.account.wallet },
        timeout: COLLATERAL_RETURN_REQUEST_TIMEOUT_MS,
      })
      .andThen(validateWith(CollateralReturnPlanResponseSchema)),
  );

  return toCollateralReturnPlan(response);
}

function toCollateralReturnPlan(
  response: CollateralReturnPlanResponse,
): CollateralReturnPlan {
  return {
    blockNumber: response.blockNumber,
    chainId: response.chainId,
    collateralReturned: response.netPusdOut,
    finalCollateral: response.finalPusd,
    operations: response.operations,
    planHash: response.planHash,
    positionSummary: response.positionSummary,
    requiredCollateral: response.requiredPusdInput,
    requiredPositions: response.requiredPositions,
    routerCall: response.routerCall,
    startingCollateral: response.startingPusd,
    truncated: response.truncated,
    wallet: response.wallet,
  };
}

export type ExecuteCollateralReturnPlanRequest = {
  /** The plan to execute, as returned by `planCollateralReturn()`. */
  plan: CollateralReturnPlan;
};

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
  const { plan } = request;

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

        return await submitCollateralReturnPlan(client, plan, envelope);
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
  plan: CollateralReturnPlan,
  envelope: CollateralReturnEnvelope,
): Promise<TransactionHandle> {
  const response = await unwrap(
    client.combos
      .post('/v1/collateral-return/submit', {
        json: { envelope, plan_hash: plan.planHash },
        timeout: COLLATERAL_RETURN_REQUEST_TIMEOUT_MS,
      })
      .andThen(validateWith(RelayerExecuteResponseSchema)),
  );

  return new GaslessTransactionHandle(client, response);
}
