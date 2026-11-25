import {
  WalletMigrationKnownState,
  WalletMigrationNextAction,
  WalletMigrationSafeCreateTypedDataSchema,
  type WalletMigrationStep,
  type WalletMigrationSweep,
} from '@polymarket/bindings/gamma';
import {
  type EvmAddress,
  type EvmSignature,
  type HexString,
  isSameEvmAddress,
  ZERO_ADDRESS,
} from '@polymarket/types';
import {
  RequestRejectedError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
} from '../errors';
import type { TypedDataPayload } from '../types';

/**
 * The body of an execute request. The signed body submits a sweep. The empty
 * body continues a migration that has nothing to sign, or polls a sweep that
 * the server already has.
 * @internal
 */
export type WalletMigrationExecuteBody =
  | { signature: EvmSignature; digest: HexString }
  | Record<string, never>;

/**
 * The requests and the signer that run a wallet migration or a leftover sweep.
 * @internal
 */
export type WalletMigrationSteps = {
  start(): Promise<WalletMigrationStep>;
  execute(body: WalletMigrationExecuteBody): Promise<WalletMigrationStep>;
  sign(sweep: WalletMigrationSweep): Promise<EvmSignature>;
  wait(): Promise<void>;
  maxPolls: number;
};

// A stale digest, a lost answer or a conflict sends the flow back to its start
// request. The limit stops a flow that never settles.
const MAX_RESTARTS = 3;

// One start request needs at most a Safe deployment signature and a sweep
// signature. The limit stops a flow that keeps asking for signatures.
const MAX_SIGNATURES_PER_START = 2;

/**
 * Runs a wallet migration or a leftover sweep from its start request to its
 * last step and returns that step.
 *
 * A step with state `FAILED` throws, whatever its next action. Otherwise the
 * flow follows the next action of each step. A sign step signs the sweep and
 * executes it, up to two signatures for each start request. An execute step
 * waits, then polls with an empty body, up to `maxPolls` polls in the whole
 * flow. A start step, or a sign step without a sweep, calls the start request
 * again. A conflict (`409`), a bad gateway answer (`502`) or a transport
 * failure of an execute request also calls the start request again, because
 * the start request is idempotent and names the step that is left.
 * @internal
 */
export async function runWalletMigrationSteps(
  steps: WalletMigrationSteps,
): Promise<WalletMigrationStep> {
  let restarts = 0;
  let polls = 0;
  let signatures = 0;

  async function restart(): Promise<WalletMigrationStep> {
    restarts += 1;
    if (restarts > MAX_RESTARTS)
      throw new TimeoutError(
        `The wallet migration did not settle after ${MAX_RESTARTS} restarts.`,
      );
    signatures = 0;
    return steps.start();
  }
  async function execute(
    body: WalletMigrationExecuteBody,
  ): Promise<WalletMigrationStep> {
    try {
      return await steps.execute(body);
    } catch (error) {
      if (!isUnsettledExecute(error)) throw error;
      return restart();
    }
  }

  let step = await steps.start();
  for (;;) {
    if (step.state === WalletMigrationKnownState.Failed)
      throw new TransactionFailedError(
        `The wallet migration failed: ${step.failedReason ?? 'no reason given'}.`,
      );
    switch (step.nextAction) {
      case WalletMigrationNextAction.None:
        return step;
      case WalletMigrationNextAction.Start:
        step = await restart();
        break;
      case WalletMigrationNextAction.Sign: {
        const sweep = step.sweep;
        if (sweep === null || sweep === undefined) {
          step = await restart();
          break;
        }
        signatures += 1;
        if (signatures > MAX_SIGNATURES_PER_START)
          throw new TimeoutError(
            `The wallet migration asked for more than ${MAX_SIGNATURES_PER_START} signatures after one start request.`,
          );
        const signature = await steps.sign(sweep);
        step = await execute({ signature, digest: sweep.digest });
        break;
      }
      case WalletMigrationNextAction.Execute:
        polls += 1;
        if (polls > steps.maxPolls)
          throw new TimeoutError(
            `The wallet migration did not finish after ${steps.maxPolls} polls.`,
          );
        await steps.wait();
        step = await execute({});
        break;
    }
  }
}

function isUnsettledExecute(error: unknown): boolean {
  if (error instanceof TransportError) return true;
  return (
    error instanceof RequestRejectedError &&
    (error.status === 409 || error.status === 502)
  );
}

const SAFE_FACTORY_DOMAIN_NAME = 'Polymarket Contract Proxy Factory';

const CREATE_PROXY_FIELDS = [
  { name: 'paymentToken', type: 'address' },
  { name: 'payment', type: 'uint256' },
  { name: 'paymentReceiver', type: 'address' },
] as const;

/**
 * Returns the `CreateProxy` payload that a `safe-create` sweep signs. The
 * function checks every member of the server's typed data against the
 * Polymarket Safe factory of `environment`, with no payment, and builds the
 * payload from those fixed values.
 * @internal
 */
export function safeCreateTypedData(
  environment: { chainId: number; safeFactory: EvmAddress },
  typedData: unknown,
): TypedDataPayload {
  const parsed = WalletMigrationSafeCreateTypedDataSchema.safeParse(typedData);
  if (
    !parsed.success ||
    parsed.data.domain.chainId !== BigInt(environment.chainId) ||
    !isSameEvmAddress(
      parsed.data.domain.verifyingContract,
      environment.safeFactory,
    ) ||
    !isSameEvmAddress(parsed.data.message.paymentToken, ZERO_ADDRESS) ||
    parsed.data.message.payment !== 0n ||
    !isSameEvmAddress(parsed.data.message.paymentReceiver, ZERO_ADDRESS)
  )
    throw new UnexpectedResponseError(
      'The Safe deployment that the wallet migration asks to sign does not match the Polymarket Safe factory.',
    );
  return {
    domain: {
      name: SAFE_FACTORY_DOMAIN_NAME,
      chainId: environment.chainId,
      verifyingContract: environment.safeFactory,
    },
    primaryType: 'CreateProxy',
    types: { CreateProxy: CREATE_PROXY_FIELDS },
    message: {
      paymentToken: ZERO_ADDRESS,
      payment: 0n,
      paymentReceiver: ZERO_ADDRESS,
    },
  };
}
