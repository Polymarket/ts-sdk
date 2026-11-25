import type { BearerCredentials } from '@polymarket/bindings';
import {
  type WalletLeftovers,
  WalletLeftoversSchema,
  type WalletMigration,
  WalletMigrationKnownState,
  type WalletMigrationPreview,
  WalletMigrationPreviewSchema,
  WalletMigrationSchema,
  WalletMigrationStepSchema,
  type WalletMigrationSweep,
  WalletMigrationSweepShape,
  WalletType,
} from '@polymarket/bindings/gamma';
import { delay, type EvmAddress, type EvmSignature } from '@polymarket/types';
import type { BaseSecureClient } from '../clients';
import {
  CancelledSigningError,
  makeErrorGuard,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseRequestOptions, type RequestOptions } from '../request-options';
import { resolveAccountIdentity, SignerType } from '../wallet';
import {
  runWalletMigrationSteps,
  safeCreateTypedData,
  type WalletMigrationSteps,
} from './wallet-migration-steps';

// An execute request waits while its transaction confirms. It can also answer
// with a step that is still in progress.
const WALLET_MIGRATION_REQUEST_TIMEOUT_MS = 2 * 60_000;

export type FetchWalletMigrationError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchWalletMigrationError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches the wallet migration of the authenticated account: its state, the
 * Deposit Wallet, the holdings of the current wallet and the next action. The
 * read changes nothing.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const migration = await fetchWalletMigration(client);
 * ```
 *
 * @throws {@link FetchWalletMigrationError}
 * Thrown on failure.
 * @experimental May change without notice.
 */
export async function fetchWalletMigration(
  client: BaseSecureClient,
  options: RequestOptions = {},
): Promise<WalletMigration> {
  return client.predictions.get('/v1/wallets/migration/status', {
    ...parseRequestOptions(options),
    schema: WalletMigrationSchema,
  });
}

export type PreviewWalletMigrationError = FetchWalletMigrationError;
export const PreviewWalletMigrationError = FetchWalletMigrationError;

/**
 * Previews the wallet migration of the authenticated account: what it would
 * move, and each blocker that stops it. The read changes nothing. An account
 * that already trades from its Deposit Wallet is rejected with status `422`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const preview = await previewWalletMigration(client);
 * ```
 *
 * @throws {@link PreviewWalletMigrationError}
 * Thrown on failure.
 * @experimental May change without notice.
 */
export async function previewWalletMigration(
  client: BaseSecureClient,
  options: RequestOptions = {},
): Promise<WalletMigrationPreview> {
  return client.predictions.get('/v1/wallets/migration/preview', {
    ...parseRequestOptions(options),
    schema: WalletMigrationPreviewSchema,
  });
}

export type MigrateWalletResult = {
  /** The Deposit Wallet that the account trades from now. */
  depositWallet: EvmAddress;
  /** The credentials of the session, bound to the Deposit Wallet. */
  credentials: BearerCredentials;
};

export type MigrateWalletError =
  | CancelledSigningError
  | RateLimitError
  | RequestAbortedError
  | RequestRejectedError
  | SigningError
  | TimeoutError
  | TransactionFailedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const MigrateWalletError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Moves the authenticated account from its Safe or Proxy wallet to its
 * Deposit Wallet, then binds the Deposit Wallet to this client's session.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * The migration asks the signer to sign each sweep that moves funds. A
 * restart after a conflict can ask for another signature. A poll while a
 * transaction confirms asks for none. The migration waits while the
 * transactions confirm, and it continues a migration that an earlier call
 * started. A migration that cannot start is rejected with status `422` and a
 * blocker code, such as `SIBLING_FUNDED`. Call {@link previewWalletMigration}
 * first to show the blockers. A failed migration throws
 * `TransactionFailedError`, and a new call starts it again. A migration that
 * ends in a state other than `COMPLETED`, such as `NOT_REQUIRED` for an account
 * that already uses its Deposit Wallet, throws `UnexpectedResponseError` and
 * binds nothing. If the bind fails after the migration completes,
 * `migrateWallet` rejects, and a new call binds the Deposit Wallet while the
 * session is usable. A bind that times out can still apply on the server, and
 * the session then follows the Deposit Wallet.
 *
 * @example
 * ```ts
 * const { credentials } = await migrateWallet(client);
 * await saveCredentials(credentials);
 * ```
 *
 * @throws {@link MigrateWalletError}
 * Thrown on failure.
 * @experimental May change without notice.
 */
export async function migrateWallet(
  client: BaseSecureClient,
): Promise<MigrateWalletResult> {
  const step = await runWalletMigrationSteps(
    walletMigrationSteps(
      client,
      '/v1/wallets/migration/start',
      '/v1/wallets/migration/execute',
    ),
  );
  if (step.state !== WalletMigrationKnownState.Completed)
    throw new UnexpectedResponseError(
      `The wallet migration ended in state ${step.state}. The session bind requires state COMPLETED.`,
    );
  if (step.depositWallet === undefined)
    throw new UnexpectedResponseError(
      'The finished wallet migration names no Deposit Wallet.',
    );
  // A wrong destination must not report success on the legacy wallet.
  const destination = resolveAccountIdentity(
    client.environment,
    client.account.signer,
    step.depositWallet,
  );
  if (
    destination.signerType !== SignerType.OWNER ||
    destination.walletType !== WalletType.DEPOSIT_WALLET
  )
    throw new UnexpectedResponseError(
      'The finished wallet migration names a wallet that is not a Deposit Wallet of the signer.',
    );
  const credentials = await client.upgradeCredentials({
    wallet: step.depositWallet,
  });
  return { depositWallet: step.depositWallet, credentials };
}

export type CancelWalletMigrationError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError;
export const CancelWalletMigrationError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
);

/**
 * Cancels the wallet migration of the authenticated account before funds
 * move. The account keeps its current wallet and can migrate later. A
 * migration whose transaction is in flight, or whose funds reached the
 * Deposit Wallet, is rejected with status `409`. A deployment that keeps the
 * cancel off rejects it with status `503`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const migration = await cancelWalletMigration(client);
 * ```
 *
 * @throws {@link CancelWalletMigrationError}
 * Thrown on failure.
 * @experimental May change without notice.
 */
export async function cancelWalletMigration(
  client: BaseSecureClient,
): Promise<WalletMigration> {
  return client.predictions.post('/v1/wallets/migration/cancel', {
    json: {},
    schema: WalletMigrationSchema,
  });
}

export type FetchWalletLeftoversError = FetchWalletMigrationError;
export const FetchWalletLeftoversError = FetchWalletMigrationError;

/**
 * Fetches what the old wallet of a migrated account still holds, its value,
 * the blockers of a leftover sweep and the state of the last sweep. The read
 * changes nothing. An account whose wallet is no longer the Deposit Wallet of
 * its migration is rejected with status `409`.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const leftovers = await fetchWalletLeftovers(client);
 * ```
 *
 * @throws {@link FetchWalletLeftoversError}
 * Thrown on failure.
 * @experimental May change without notice.
 */
export async function fetchWalletLeftovers(
  client: BaseSecureClient,
  options: RequestOptions = {},
): Promise<WalletLeftovers> {
  return client.predictions.get('/v1/wallets/migration/leftovers', {
    ...parseRequestOptions(options),
    schema: WalletLeftoversSchema,
  });
}

export type SweepWalletLeftoversError = MigrateWalletError;
export const SweepWalletLeftoversError = MigrateWalletError;

/**
 * Moves what the old wallet of a migrated account still holds to the Deposit
 * Wallet, and returns the leftovers after the sweep. Check `hasLeftovers` and
 * `lastSweep` in the result to see the outcome.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * The sweep asks the signer to sign it when funds must move, and it waits
 * while the transaction confirms. A restart after a conflict can ask for
 * another signature. It does not change the session. An account without a
 * completed migration is rejected with status `409`, a blocked sweep with
 * status `422`, and a deployment that keeps the sweep off rejects it with
 * status `503`.
 *
 * @example
 * ```ts
 * const leftovers = await sweepWalletLeftovers(client);
 * ```
 *
 * @throws {@link SweepWalletLeftoversError}
 * Thrown on failure.
 * @experimental May change without notice.
 */
export async function sweepWalletLeftovers(
  client: BaseSecureClient,
): Promise<WalletLeftovers> {
  await runWalletMigrationSteps(
    walletMigrationSteps(
      client,
      '/v1/wallets/migration/sweep/start',
      '/v1/wallets/migration/sweep/execute',
    ),
  );
  return fetchWalletLeftovers(client);
}

function walletMigrationSteps(
  client: BaseSecureClient,
  startPath: string,
  executePath: string,
): WalletMigrationSteps {
  const { environment } = client;
  return {
    start: () =>
      client.predictions.post(startPath, {
        json: {},
        timeout: WALLET_MIGRATION_REQUEST_TIMEOUT_MS,
        schema: WalletMigrationStepSchema,
      }),
    execute: (body) =>
      client.predictions.post(executePath, {
        json: body,
        timeout: WALLET_MIGRATION_REQUEST_TIMEOUT_MS,
        schema: WalletMigrationStepSchema,
      }),
    sign: (sweep) => signWalletMigrationSweep(client, sweep),
    wait: () => delay(environment.relayerPollFrequencyMs),
    maxPolls: environment.relayerMaxPolls,
  };
}

async function signWalletMigrationSweep(
  client: BaseSecureClient,
  sweep: WalletMigrationSweep,
): Promise<EvmSignature> {
  // Check the Safe deployment before the signer sees it.
  const payload =
    sweep.shape === WalletMigrationSweepShape.SafeCreate
      ? safeCreateTypedData(
          {
            chainId: client.environment.chainId,
            safeFactory: client.environment.walletDerivation.safeFactory,
          },
          sweep.typedData,
        )
      : undefined;
  try {
    // Proxy and Safe sweeps sign the raw digest as a personal message.
    return payload === undefined
      ? await client.signer.signMessage(sweep.digest)
      : await client.signer.signTypedData(payload);
  } catch (error) {
    if (error instanceof CancelledSigningError) throw error;
    throw SigningError.fromError(
      error,
      'Could not sign the wallet migration sweep.',
    );
  }
}
