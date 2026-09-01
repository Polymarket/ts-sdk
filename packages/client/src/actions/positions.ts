import type {
  ComboConditionId,
  ConditionId,
  MarketId,
  PositionId,
  TokenId,
} from '@polymarket/bindings';
import {
  ConditionIdSchema,
  MarketIdSchema,
  PositionIdSchema,
} from '@polymarket/bindings';
import { type Market, WalletType } from '@polymarket/bindings/gamma';
import {
  type EvmAddress,
  type EvmSignature,
  invariant,
  isPresent,
} from '@polymarket/types';
import { z } from 'zod';
import {
  combinatorialPrepareConditionCall,
  ctfMergePositionsCall,
  ctfRedeemPositionsCall,
  ctfSplitPositionCall,
  decodeErc1155BalanceOfBatchResult,
  decodeErc1155BalanceOfResult,
  erc1155BalanceOfBatchCall,
  erc1155BalanceOfCall,
  routerMergeCall,
  routerRedeemCall,
  routerSplitCall,
} from '../abis';
import type { BaseSecureClient } from '../clients';
import {
  CancelledSigningError,
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import {
  canonicalizeComboLegs,
  decodeV2OutcomePositionId,
  deriveComboPositionContext,
} from '../protocol';
import {
  expectTransactionHandle,
  type SignerTransactionRequest,
  type TransactionCall,
  type TransactionHandle,
} from '../types';
import {
  completeWith,
  type SendMergePositionsTransactionRequest,
  type SendRedeemPositionsTransactionRequest,
  type SendSplitPositionTransactionRequest,
  signerTransactionRequest,
} from '../workflow';
import {
  GaslessTransactionMetadataSchema,
  type GaslessWorkflowRequest,
  prepareGaslessTransaction,
} from './gasless';
import { listMarkets } from './markets';

enum PositionProtocol {
  CTF = 'ctf',
  V2 = 'v2',
}

export type SplitPositionWorkflowRequest =
  | GaslessWorkflowRequest
  | SendSplitPositionTransactionRequest;

export type SplitPositionWorkflow = AsyncGenerator<
  SplitPositionWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

export type PrepareSplitPositionError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareSplitPositionError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Parameters for preparing a market position split.
 *
 * @remarks
 * The condition ID may identify either a CTF or Polymarket V2 market. The SDK
 * resolves the protocol internally.
 */
export type PrepareSplitMarketPositionRequest = {
  /** Amount of collateral to convert into market positions. */
  amount: bigint;
  /** Existing market condition ID that identifies the positions to mint. */
  conditionId: string | ConditionId;
  /** Optional transaction metadata for workflows that support metadata. */
  metadata?: string;
};

const PrepareSplitMarketPositionRequestSchema = z.object({
  amount: z.bigint().min(0n),
  conditionId: ConditionIdSchema,
  metadata: GaslessTransactionMetadataSchema.optional(),
}) satisfies z.ZodType<PrepareSplitMarketPositionRequest>;

/** @deprecated Use {@link PrepareSplitPositionError}. */
export type PrepareSplitMarketPositionError = PrepareSplitPositionError;
/** @deprecated Use {@link PrepareSplitPositionError}. */
export const PrepareSplitMarketPositionError = PrepareSplitPositionError;

/**
 * Starts a split workflow for a market condition.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareSplitMarketPosition(client, {
 *   amount: 1n,
 *   conditionId:
 *     '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
 * });
 * ```
 *
 * @throws {@link PrepareSplitPositionError}
 * Thrown on failure.
 */
export async function prepareSplitMarketPosition(
  client: BaseSecureClient,
  request: PrepareSplitMarketPositionRequest,
): Promise<SplitPositionWorkflow> {
  const params = parseUserInput(
    request,
    PrepareSplitMarketPositionRequestSchema,
  );
  const context = await resolveMarketPositionContext(client, {
    conditionId: params.conditionId,
  });
  const call =
    context.protocol === PositionProtocol.CTF
      ? ctfSplitPositionCall(
          context.adapterAddress,
          client.environment.contracts.collateralToken,
          context.conditionId,
          params.amount,
        )
      : routerSplitCall(
          client.environment.contracts.protocolV2Router,
          context.conditionId,
          params.amount,
        );

  return async function* (): SplitPositionWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield sendSplitPositionTransaction(
          signerTransactionRequest(client.environment.chainId, call),
        ),
      );
    }

    return yield* await prepareGaslessTransaction(client, {
      calls: [call],
      metadata:
        params.metadata ??
        `Split ${params.amount} positions for market ${context.marketId} (condition ${context.conditionId})`,
    });
  }.call(null);
}

/**
 * Parameters for preparing a combo position split.
 */
export type PrepareSplitComboPositionRequest = {
  /** Amount of collateral to convert into combo positions. */
  amount: bigint;
  /** Protocol v2 leg position IDs that define the combo condition. */
  legs: string[] | PositionId[];
  /** Optional transaction metadata for workflows that support metadata. */
  metadata?: string;
};

const PrepareSplitComboPositionRequestSchema = z.object({
  amount: z.bigint().positive(),
  legs: z.array(PositionIdSchema).min(1).max(50),
  metadata: GaslessTransactionMetadataSchema.optional(),
}) satisfies z.ZodType<PrepareSplitComboPositionRequest>;

/** @deprecated Use {@link PrepareSplitPositionError}. */
export type PrepareSplitComboPositionError = PrepareSplitPositionError;
/** @deprecated Use {@link PrepareSplitPositionError}. */
export const PrepareSplitComboPositionError = PrepareSplitPositionError;

/**
 * Starts a split workflow for a combo position from leg position IDs.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareSplitComboPosition(client, {
 *   amount: 1n,
 *   legs: ['123', '456'],
 * });
 * ```
 *
 * @throws {@link PrepareSplitPositionError}
 * Thrown on failure.
 */
export async function prepareSplitComboPosition(
  client: BaseSecureClient,
  request: PrepareSplitComboPositionRequest,
): Promise<SplitPositionWorkflow> {
  const params = parseUserInput(
    request,
    PrepareSplitComboPositionRequestSchema,
  );
  const legs = canonicalizeComboLegs(params.legs);
  const prepareConditionCall = combinatorialPrepareConditionCall(
    client.environment.contracts.combinatorialModule,
    legs,
  );
  const combo = deriveComboPositionContext(legs);
  const splitCall = routerSplitCall(
    client.environment.contracts.protocolV2Router,
    combo.conditionId,
    params.amount,
  );

  return async function* (): SplitPositionWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      const prepareHandle = expectTransactionHandle(
        yield sendSplitPositionTransaction(
          signerTransactionRequest(
            client.environment.chainId,
            prepareConditionCall,
          ),
        ),
      );
      await prepareHandle.wait();

      return expectTransactionHandle(
        yield sendSplitPositionTransaction(
          signerTransactionRequest(client.environment.chainId, splitCall),
        ),
      );
    }

    return yield* await prepareGaslessTransaction(client, {
      calls: [prepareConditionCall, splitCall],
      metadata:
        params.metadata ??
        `Split ${params.amount} combo positions for condition ${combo.conditionId}`,
    });
  }.call(null);
}

/**
 * Parameters for preparing a position split.
 *
 * @remarks
 * Provide `conditionId` for an existing market condition or `legs` to derive a
 * Combo condition.
 */
export type PrepareSplitPositionRequest =
  | PrepareSplitMarketPositionRequest
  | PrepareSplitComboPositionRequest;

const PrepareSplitPositionRequestSchema = z.union([
  PrepareSplitMarketPositionRequestSchema.extend({
    legs: z.never().optional(),
  }),
  PrepareSplitComboPositionRequestSchema.extend({
    conditionId: z.never().optional(),
  }),
]) satisfies z.ZodType<PrepareSplitPositionRequest>;

/**
 * Starts a position split workflow.
 *
 * @throws {@link PrepareSplitPositionError}
 * Thrown on failure.
 */
export async function prepareSplitPosition(
  client: BaseSecureClient,
  request: PrepareSplitPositionRequest,
): Promise<SplitPositionWorkflow> {
  const params = parseUserInput(request, PrepareSplitPositionRequestSchema);

  if (params.legs !== undefined) {
    return prepareSplitComboPosition(client, params);
  }

  return prepareSplitMarketPosition(client, params);
}

export type SplitPositionError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TimeoutError
  | TransactionFailedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const SplitPositionError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);
/** @deprecated Use {@link SplitPositionError}. */
export type SplitMarketPositionError = SplitPositionError;
/** @deprecated Use {@link SplitPositionError}. */
export const SplitMarketPositionError = SplitPositionError;

/**
 * Splits collateral into market positions.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link SplitPositionError}
 * Thrown on failure.
 */
export function splitMarketPosition(
  client: BaseSecureClient,
  request: PrepareSplitMarketPositionRequest,
): Promise<TransactionHandle> {
  return prepareSplitMarketPosition(client, request).then(
    completeWith(client.signer),
  );
}

/** @deprecated Use {@link SplitPositionError}. */
export type SplitComboPositionError = SplitPositionError;
/** @deprecated Use {@link SplitPositionError}. */
export const SplitComboPositionError = SplitPositionError;

/**
 * Splits collateral into combo positions from leg position IDs.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link SplitPositionError}
 * Thrown on failure.
 */
export function splitComboPosition(
  client: BaseSecureClient,
  request: PrepareSplitComboPositionRequest,
): Promise<TransactionHandle> {
  return prepareSplitComboPosition(client, request).then(
    completeWith(client.signer),
  );
}

/**
 * Splits collateral into positions.
 *
 * @throws {@link SplitPositionError}
 * Thrown on failure.
 */
export function splitPosition(
  client: BaseSecureClient,
  request: PrepareSplitPositionRequest,
): Promise<TransactionHandle> {
  return prepareSplitPosition(client, request).then(
    completeWith(client.signer),
  );
}

export type MergePositionsWorkflowRequest =
  | GaslessWorkflowRequest
  | SendMergePositionsTransactionRequest;

export type MergePositionsWorkflow = AsyncGenerator<
  MergePositionsWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

export type PrepareMergePositionsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareMergePositionsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Parameters for preparing a market position merge.
 *
 * @remarks
 * The condition ID may identify either a CTF or Polymarket V2 market. The SDK
 * resolves the protocol internally.
 */
export type PrepareMergeMarketPositionRequest = {
  /** Amount per complementary market position to merge. */
  amount: bigint | 'max';
  /** Existing market condition ID that identifies the positions to merge. */
  conditionId: string | ConditionId;
  /** Optional transaction metadata for workflows that support metadata. */
  metadata?: string;
};

const PrepareMergeMarketPositionRequestSchema = z.object({
  amount: z.union([z.bigint().positive(), z.literal('max')]),
  conditionId: ConditionIdSchema,
  metadata: GaslessTransactionMetadataSchema.optional(),
}) satisfies z.ZodType<PrepareMergeMarketPositionRequest>;

/** @deprecated Use {@link PrepareMergePositionsError}. */
export type PrepareMergeMarketPositionError = PrepareMergePositionsError;
/** @deprecated Use {@link PrepareMergePositionsError}. */
export const PrepareMergeMarketPositionError = PrepareMergePositionsError;

/**
 * Starts a workflow to merge complementary positions in a market back into collateral.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareMergeMarketPosition(client, {
 *   amount: 'max',
 *   conditionId:
 *     '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
 * });
 * ```
 *
 * @throws {@link PrepareMergePositionsError}
 * Thrown on failure.
 */
export async function prepareMergeMarketPosition(
  client: BaseSecureClient,
  request: PrepareMergeMarketPositionRequest,
): Promise<MergePositionsWorkflow> {
  const params = parseUserInput(
    request,
    PrepareMergeMarketPositionRequestSchema,
  );
  const context = await resolveMarketPositionContext(client, {
    conditionId: params.conditionId,
  });
  const balances = decodeErc1155BalanceOfBatchResult(
    await client.rpc.ethCall(
      erc1155BalanceOfBatchCall(
        context.positionErc1155Address,
        client.account.wallet,
        context.outcomeIds,
      ),
    ),
  );
  const amount = resolveMergeAmount(
    context.conditionId,
    balances,
    params.amount,
  );
  const call =
    context.protocol === PositionProtocol.CTF
      ? ctfMergePositionsCall(
          context.adapterAddress,
          client.environment.contracts.collateralToken,
          context.conditionId,
          amount,
        )
      : routerMergeCall(
          client.environment.contracts.protocolV2Router,
          context.conditionId,
          amount,
        );

  return async function* (): MergePositionsWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield sendMergePositionsTransaction(
          signerTransactionRequest(client.environment.chainId, call),
        ),
      );
    }

    return yield* await prepareGaslessTransaction(client, {
      calls: [call],
      metadata:
        params.metadata ??
        `Merge ${amount} positions for market ${context.marketId} (condition ${context.conditionId})`,
    });
  }.call(null);
}

/**
 * Parameters for preparing a combo position merge.
 */
export type PrepareMergeComboPositionRequest = {
  /** Amount per complementary combo position to merge. */
  amount: bigint | 'max';
  /** Protocol v2 leg position IDs that define the combo condition. */
  legs: string[] | PositionId[];
  /** Optional transaction metadata for workflows that support metadata. */
  metadata?: string;
};

const PrepareMergeComboPositionRequestSchema = z.object({
  amount: z.union([z.bigint().positive(), z.literal('max')]),
  legs: z.array(PositionIdSchema).min(1).max(50),
  metadata: GaslessTransactionMetadataSchema.optional(),
}) satisfies z.ZodType<PrepareMergeComboPositionRequest>;

/** @deprecated Use {@link PrepareMergePositionsError}. */
export type PrepareMergeComboPositionError = PrepareMergePositionsError;
/** @deprecated Use {@link PrepareMergePositionsError}. */
export const PrepareMergeComboPositionError = PrepareMergePositionsError;

/**
 * Starts a workflow to merge complementary combo positions back into collateral.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareMergeComboPosition(client, {
 *   amount: 'max',
 *   legs: ['123', '456'],
 * });
 * ```
 *
 * @throws {@link PrepareMergePositionsError}
 * Thrown on failure.
 */
export async function prepareMergeComboPosition(
  client: BaseSecureClient,
  request: PrepareMergeComboPositionRequest,
): Promise<MergePositionsWorkflow> {
  const params = parseUserInput(
    request,
    PrepareMergeComboPositionRequestSchema,
  );
  const legs = canonicalizeComboLegs(params.legs);
  const prepareConditionCall = combinatorialPrepareConditionCall(
    client.environment.contracts.combinatorialModule,
    legs,
  );
  const combo = deriveComboPositionContext(legs);
  const balances = decodeErc1155BalanceOfBatchResult(
    await client.rpc.ethCall(
      erc1155BalanceOfBatchCall(
        client.environment.contracts.positionManager,
        client.account.wallet,
        combo.positionIds,
      ),
    ),
  );
  const amount = resolveMergeAmount(combo.conditionId, balances, params.amount);
  const mergeCall = routerMergeCall(
    client.environment.contracts.protocolV2Router,
    combo.conditionId,
    amount,
  );

  return async function* (): MergePositionsWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      const prepareHandle = expectTransactionHandle(
        yield sendMergePositionsTransaction(
          signerTransactionRequest(
            client.environment.chainId,
            prepareConditionCall,
          ),
        ),
      );
      await prepareHandle.wait();

      return expectTransactionHandle(
        yield sendMergePositionsTransaction(
          signerTransactionRequest(client.environment.chainId, mergeCall),
        ),
      );
    }

    return yield* await prepareGaslessTransaction(client, {
      calls: [prepareConditionCall, mergeCall],
      metadata:
        params.metadata ??
        `Merge ${amount} combo positions for condition ${combo.conditionId}`,
    });
  }.call(null);
}

/**
 * Parameters for preparing a position merge.
 *
 * @remarks
 * Provide `conditionId` for an existing market condition or `legs` to derive a
 * Combo condition.
 */
export type PrepareMergePositionsRequest =
  | PrepareMergeMarketPositionRequest
  | PrepareMergeComboPositionRequest;

const PrepareMergePositionsRequestSchema = z.union([
  PrepareMergeMarketPositionRequestSchema.extend({
    legs: z.never().optional(),
  }),
  PrepareMergeComboPositionRequestSchema.extend({
    conditionId: z.never().optional(),
  }),
]) satisfies z.ZodType<PrepareMergePositionsRequest>;

/**
 * Starts a position merge workflow.
 *
 * @throws {@link PrepareMergePositionsError}
 * Thrown on failure.
 */
export async function prepareMergePositions(
  client: BaseSecureClient,
  request: PrepareMergePositionsRequest,
): Promise<MergePositionsWorkflow> {
  const params = parseUserInput(request, PrepareMergePositionsRequestSchema);

  if (params.legs !== undefined) {
    return prepareMergeComboPosition(client, params);
  }

  return prepareMergeMarketPosition(client, params);
}

export type MergePositionsError =
  | CancelledSigningError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TimeoutError
  | TransactionFailedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const MergePositionsError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);
/** @deprecated Use {@link MergePositionsError}. */
export type MergeMarketPositionError = MergePositionsError;
/** @deprecated Use {@link MergePositionsError}. */
export const MergeMarketPositionError = MergePositionsError;

/**
 * Merges complementary market positions back into collateral.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link MergePositionsError}
 * Thrown on failure.
 */
export function mergeMarketPosition(
  client: BaseSecureClient,
  request: PrepareMergeMarketPositionRequest,
): Promise<TransactionHandle> {
  return prepareMergeMarketPosition(client, request).then(
    completeWith(client.signer),
  );
}

/** @deprecated Use {@link MergePositionsError}. */
export type MergeComboPositionError = MergePositionsError;
/** @deprecated Use {@link MergePositionsError}. */
export const MergeComboPositionError = MergePositionsError;

/**
 * Merges complementary combo positions back into collateral.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link MergePositionsError}
 * Thrown on failure.
 */
export function mergeComboPosition(
  client: BaseSecureClient,
  request: PrepareMergeComboPositionRequest,
): Promise<TransactionHandle> {
  return prepareMergeComboPosition(client, request).then(
    completeWith(client.signer),
  );
}

/**
 * Merges complementary positions back into collateral.
 *
 * @throws {@link MergePositionsError}
 * Thrown on failure.
 */
export function mergePositions(
  client: BaseSecureClient,
  request: PrepareMergePositionsRequest,
): Promise<TransactionHandle> {
  return prepareMergePositions(client, request).then(
    completeWith(client.signer),
  );
}

export type RedeemPositionsWorkflowRequest =
  | GaslessWorkflowRequest
  | SendRedeemPositionsTransactionRequest;

export type RedeemPositionsWorkflow = AsyncGenerator<
  RedeemPositionsWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

export type PrepareRedeemPositionsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const PrepareRedeemPositionsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Parameters for preparing a market position redemption by condition ID.
 *
 * @remarks
 * The condition ID may identify either a CTF or Polymarket V2 market. The SDK
 * resolves the protocol internally.
 */
export type PrepareRedeemMarketPositionsByConditionIdRequest = {
  /** Existing market condition ID that identifies the positions to redeem. */
  conditionId: string | ConditionId;
  marketId?: never;
  amount?: never;
  positionId?: never;
  /** Optional transaction metadata for workflows that support metadata. */
  metadata?: string;
};

/**
 * Parameters for preparing a market position redemption by market ID.
 */
export type PrepareRedeemMarketPositionsByMarketIdRequest = {
  conditionId?: never;
  /** Existing market ID that identifies the positions to redeem. */
  marketId: string;
  amount?: never;
  positionId?: never;
  /** Optional transaction metadata for workflows that support metadata. */
  metadata?: string;
};

export type PrepareRedeemMarketPositionsRequest =
  | PrepareRedeemMarketPositionsByConditionIdRequest
  | PrepareRedeemMarketPositionsByMarketIdRequest;

const PrepareRedeemMarketPositionsByConditionIdRequestSchema = z.object({
  conditionId: ConditionIdSchema,
  marketId: z.never().optional(),
  amount: z.never().optional(),
  positionId: z.never().optional(),
  metadata: GaslessTransactionMetadataSchema.optional(),
}) satisfies z.ZodType<PrepareRedeemMarketPositionsByConditionIdRequest>;

const PrepareRedeemMarketPositionsByMarketIdRequestSchema = z.object({
  conditionId: z.never().optional(),
  marketId: MarketIdSchema,
  amount: z.never().optional(),
  positionId: z.never().optional(),
  metadata: GaslessTransactionMetadataSchema.optional(),
}) satisfies z.ZodType<PrepareRedeemMarketPositionsByMarketIdRequest>;

const PrepareRedeemMarketPositionsRequestSchema = z.union([
  PrepareRedeemMarketPositionsByConditionIdRequestSchema,
  PrepareRedeemMarketPositionsByMarketIdRequestSchema,
]) satisfies z.ZodType<PrepareRedeemMarketPositionsRequest>;

/** @deprecated Use {@link PrepareRedeemPositionsError}. */
export type PrepareRedeemMarketPositionsError = PrepareRedeemPositionsError;
/** @deprecated Use {@link PrepareRedeemPositionsError}. */
export const PrepareRedeemMarketPositionsError = PrepareRedeemPositionsError;

/**
 * Starts a redemption workflow for resolved market positions.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareRedeemMarketPositions(client, {
 *   conditionId:
 *     '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
 * });
 * ```
 *
 * @example
 * ```ts
 * const workflow = await prepareRedeemMarketPositions(client, {
 *   marketId: '12345',
 * });
 * ```
 *
 * @throws {@link PrepareRedeemPositionsError}
 * Thrown on failure.
 */
export async function prepareRedeemMarketPositions(
  client: BaseSecureClient,
  request: PrepareRedeemMarketPositionsRequest,
): Promise<RedeemPositionsWorkflow> {
  const params = parseUserInput(
    request,
    PrepareRedeemMarketPositionsRequestSchema,
  );
  const context = await resolveMarketPositionContext(
    client,
    params.conditionId !== undefined
      ? { conditionId: params.conditionId, closed: true }
      : { marketId: params.marketId, closed: true },
  );
  const calls = await prepareMarketRedemptionCalls(client, context);

  return async function* (): RedeemPositionsWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return yield* sendRedeemPositionCalls(client, calls);
    }

    return yield* await prepareGaslessTransaction(client, {
      calls,
      metadata:
        params.metadata ??
        `Redeem positions for market ${context.marketId} (condition ${context.conditionId})`,
    });
  }.call(null);
}

/**
 * Parameters for preparing a Polymarket V2 position redemption.
 */
export type PrepareRedeemPositionRequest = {
  /** Polymarket V2 YES/NO position ID to redeem. */
  positionId: string | PositionId;
  conditionId?: never;
  marketId?: never;
  /** Optional transaction metadata for workflows that support metadata. */
  metadata?: string;
};

const PrepareRedeemPositionRequestSchema = z.object({
  positionId: PositionIdSchema,
  conditionId: z.never().optional(),
  marketId: z.never().optional(),
  metadata: GaslessTransactionMetadataSchema.optional(),
}) satisfies z.ZodType<PrepareRedeemPositionRequest>;

/**
 * Starts a redemption workflow for a resolved Polymarket V2 position.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @example
 * ```ts
 * const workflow = await prepareRedeemPosition(client, {
 *   positionId: '123',
 * });
 * ```
 *
 * @throws {@link PrepareRedeemPositionsError}
 * Thrown on failure.
 */
export async function prepareRedeemPosition(
  client: BaseSecureClient,
  request: PrepareRedeemPositionRequest,
): Promise<RedeemPositionsWorkflow> {
  const params = parseUserInput(request, PrepareRedeemPositionRequestSchema);
  const decoded = decodeV2OutcomePositionId(params.positionId);
  const balance = decodeErc1155BalanceOfResult(
    await client.rpc.ethCall(
      erc1155BalanceOfCall(
        client.environment.contracts.positionManager,
        client.account.wallet,
        params.positionId,
      ),
    ),
  );

  if (balance === 0n) {
    throw new UserInputError('Position has no balance to redeem');
  }

  const call = routerRedeemCall(
    client.environment.contracts.protocolV2Router,
    decoded.conditionId,
    decoded.outcomeIndex,
    balance,
  );

  return async function* (): RedeemPositionsWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield sendRedeemPositionsTransaction(
          signerTransactionRequest(client.environment.chainId, call),
        ),
      );
    }

    return yield* await prepareGaslessTransaction(client, {
      calls: [call],
      metadata: params.metadata ?? `Redeem position ${params.positionId}`,
    });
  }.call(null);
}

/** @deprecated Use {@link PrepareRedeemPositionRequest}. */
export type PrepareRedeemComboPositionRequest = PrepareRedeemPositionRequest;

/** @deprecated Use {@link PrepareRedeemPositionsError}. */
export type PrepareRedeemComboPositionError = PrepareRedeemPositionsError;
/** @deprecated Use {@link PrepareRedeemPositionsError}. */
export const PrepareRedeemComboPositionError = PrepareRedeemPositionsError;

/**
 * Starts a redemption workflow for a resolved Polymarket V2 position.
 *
 * @deprecated Use {@link prepareRedeemPosition}.
 *
 * @throws {@link PrepareRedeemPositionsError}
 * Thrown on failure.
 */
export function prepareRedeemComboPosition(
  client: BaseSecureClient,
  request: PrepareRedeemComboPositionRequest,
): Promise<RedeemPositionsWorkflow> {
  return prepareRedeemPosition(client, request);
}

/**
 * Parameters for preparing position redemption for a market or a specific
 * position.
 *
 * @remarks
 * Use `marketId` or `conditionId` to redeem held positions for a market. Use
 * `positionId` to redeem a specific position.
 */
export type PrepareRedeemPositionsRequest =
  | PrepareRedeemMarketPositionsByConditionIdRequest
  | PrepareRedeemMarketPositionsByMarketIdRequest
  | PrepareRedeemPositionRequest;

const PrepareRedeemPositionsRequestSchema = z.union([
  PrepareRedeemMarketPositionsByConditionIdRequestSchema,
  PrepareRedeemMarketPositionsByMarketIdRequestSchema,
  PrepareRedeemPositionRequestSchema,
]) satisfies z.ZodType<PrepareRedeemPositionsRequest>;

/**
 * Starts a redemption workflow for held positions in a market or a specific
 * position by ID.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link PrepareRedeemPositionsError}
 * Thrown on failure.
 */
export async function prepareRedeemPositions(
  client: BaseSecureClient,
  request: PrepareRedeemPositionsRequest,
): Promise<RedeemPositionsWorkflow> {
  const params = parseUserInput(request, PrepareRedeemPositionsRequestSchema);

  if (params.positionId !== undefined) {
    return prepareRedeemPosition(client, params);
  }

  return prepareRedeemMarketPositions(client, params);
}

export type RedeemPositionsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError
  | CancelledSigningError
  | SigningError
  | TimeoutError
  | TransactionFailedError;
export const RedeemPositionsError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Redeems held positions for a market or a specific position by ID.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link RedeemPositionsError}
 * Thrown on failure.
 */
export function redeemPositions(
  client: BaseSecureClient,
  request: PrepareRedeemPositionsRequest,
): Promise<TransactionHandle> {
  return prepareRedeemPositions(client, request).then(
    completeWith(client.signer),
  );
}

function sendSplitPositionTransaction(
  request: SignerTransactionRequest,
): SendSplitPositionTransactionRequest {
  return {
    kind: 'sendSplitPositionTransaction',
    request,
  };
}

function sendMergePositionsTransaction(
  request: SignerTransactionRequest,
): SendMergePositionsTransactionRequest {
  return {
    kind: 'sendMergePositionsTransaction',
    request,
  };
}

function sendRedeemPositionsTransaction(
  request: SignerTransactionRequest,
): SendRedeemPositionsTransactionRequest {
  return {
    kind: 'sendRedeemPositionsTransaction',
    request,
  };
}

async function* sendRedeemPositionCalls(
  client: BaseSecureClient,
  calls: readonly TransactionCall[],
): RedeemPositionsWorkflow {
  const [firstCall, ...remainingCalls] = calls;

  invariant(firstCall !== undefined, 'Expected at least one redemption call');

  let call = firstCall;

  for (const nextCall of remainingCalls) {
    const handle = expectTransactionHandle(
      yield sendRedeemPositionsTransaction(
        signerTransactionRequest(client.environment.chainId, call),
      ),
    );
    await handle.wait();
    call = nextCall;
  }

  return expectTransactionHandle(
    yield sendRedeemPositionsTransaction(
      signerTransactionRequest(client.environment.chainId, call),
    ),
  );
}

type MarketPositionContextBase = {
  marketId: MarketId;
  conditionId: ConditionId;
};

type CtfMarketPositionContext = MarketPositionContextBase & {
  protocol: PositionProtocol.CTF;
  adapterAddress: EvmAddress;
  positionErc1155Address: EvmAddress;
  outcomeIds: [yes: TokenId, no: TokenId];
};

type V2MarketPositionContext = MarketPositionContextBase & {
  protocol: PositionProtocol.V2;
  positionErc1155Address: EvmAddress;
  outcomeIds: [yes: PositionId, no: PositionId];
};

type MarketPositionContext = CtfMarketPositionContext | V2MarketPositionContext;

type ResolveMarketPositionContextRequest =
  | { conditionId: ConditionId; marketId?: never; closed?: boolean }
  | { marketId: MarketId; conditionId?: never; closed?: boolean };

async function resolveMarketPositionContext(
  client: BaseSecureClient,
  request: ResolveMarketPositionContextRequest,
): Promise<MarketPositionContext> {
  const context =
    request.conditionId !== undefined
      ? `condition ${request.conditionId}`
      : `market ${request.marketId}`;
  const page = await listMarkets(
    client,
    request.conditionId !== undefined
      ? {
          conditionIds: [request.conditionId],
          closed: request.closed,
          pageSize: 1,
        }
      : {
          ids: [parseMarketId(request.marketId)],
          closed: request.closed,
          pageSize: 1,
        },
  ).firstPage();
  const [market] = page.items;

  // CTF multi-outcome markets are omitted from market listings, so they
  // surface here as not found alongside unknown IDs.
  if (market === undefined) {
    throw new UserInputError(`No market found for ${context}`);
  }

  const marketContext = normalizeMarketPositionContext(market, context);

  if (marketContext.protocol === PositionProtocol.V2) {
    return {
      ...marketContext,
      positionErc1155Address: client.environment.contracts.positionManager,
    };
  }

  return {
    ...marketContext,
    adapterAddress: marketContext.negRisk
      ? client.environment.contracts.negRiskCollateralAdapter
      : client.environment.contracts.collateralAdapter,
    positionErc1155Address: marketContext.negRisk
      ? client.environment.contracts.negRiskAdapter
      : client.environment.contracts.conditionalTokens,
  };
}

function parseMarketId(id: MarketId): number {
  const parsed = Number(id);

  if (!Number.isInteger(parsed)) {
    throw new UserInputError(`Market ID must be an integer, received ${id}`);
  }

  return parsed;
}

type NormalizedCtfMarketPositionContext = MarketPositionContextBase & {
  protocol: PositionProtocol.CTF;
  negRisk: boolean;
  outcomeIds: [yes: TokenId, no: TokenId];
};

type NormalizedV2MarketPositionContext = MarketPositionContextBase & {
  protocol: PositionProtocol.V2;
  outcomeIds: [yes: PositionId, no: PositionId];
};

function normalizeMarketPositionContext(
  market: Market,
  context: string,
): NormalizedCtfMarketPositionContext | NormalizedV2MarketPositionContext {
  if (!isPresent(market.conditionId)) {
    throw new UnexpectedResponseError(`Missing condition ID for ${context}`);
  }

  const yesTokenId = market.outcomes.yes.tokenId;
  const noTokenId = market.outcomes.no.tokenId;
  const yesPositionId = market.outcomes.yes.positionId;
  const noPositionId = market.outcomes.no.positionId;

  if (isPresent(yesTokenId) !== isPresent(noTokenId)) {
    throw new UnexpectedResponseError(
      `Incomplete market token IDs for ${context}`,
    );
  }

  if (isPresent(yesTokenId) && isPresent(noTokenId)) {
    if (!isPresent(market.state.negRisk)) {
      throw new UnexpectedResponseError(
        `Missing negative-risk flag for ${context}`,
      );
    }

    return {
      marketId: market.id,
      conditionId: market.conditionId,
      protocol: PositionProtocol.CTF,
      negRisk: market.state.negRisk,
      outcomeIds: [yesTokenId, noTokenId],
    };
  }

  if (isPresent(yesPositionId) !== isPresent(noPositionId)) {
    throw new UnexpectedResponseError(
      `Incomplete market position IDs for ${context}`,
    );
  }

  if (isPresent(yesPositionId) && isPresent(noPositionId)) {
    return {
      marketId: market.id,
      conditionId: market.conditionId,
      protocol: PositionProtocol.V2,
      outcomeIds: [yesPositionId, noPositionId],
    };
  }

  throw new UnexpectedResponseError(
    `Missing tradeable outcome IDs for ${context}`,
  );
}

async function prepareMarketRedemptionCalls(
  client: BaseSecureClient,
  context: MarketPositionContext,
): Promise<TransactionCall[]> {
  if (context.protocol === PositionProtocol.CTF) {
    return [
      ctfRedeemPositionsCall(
        context.adapterAddress,
        client.environment.contracts.collateralToken,
        context.conditionId,
      ),
    ];
  }

  const balances = decodeErc1155BalanceOfBatchResult(
    await client.rpc.ethCall(
      erc1155BalanceOfBatchCall(
        context.positionErc1155Address,
        client.account.wallet,
        context.outcomeIds,
      ),
    ),
  );

  if (balances.length !== 2) {
    throw new UnexpectedResponseError('Expected two position balances');
  }

  const [yesBalance, noBalance] = balances;

  invariant(yesBalance !== undefined, 'Expected YES position balance');
  invariant(noBalance !== undefined, 'Expected NO position balance');

  const calls: TransactionCall[] = [];

  if (yesBalance > 0n) {
    calls.push(
      routerRedeemCall(
        client.environment.contracts.protocolV2Router,
        context.conditionId,
        0,
        yesBalance,
      ),
    );
  }

  if (noBalance > 0n) {
    calls.push(
      routerRedeemCall(
        client.environment.contracts.protocolV2Router,
        context.conditionId,
        1,
        noBalance,
      ),
    );
  }

  if (calls.length === 0) {
    throw new UserInputError(
      `Market positions have no balance to redeem for condition ${context.conditionId}`,
    );
  }

  return calls;
}

function resolveMergeAmount(
  conditionId: ConditionId | ComboConditionId,
  balances: readonly bigint[],
  requestedAmount: bigint | 'max',
): bigint {
  const maxAmount = calculateMaxMergeAmount(balances);

  if (maxAmount === 0n) {
    throw new UserInputError(
      `You have no complementary positions to merge for condition ${conditionId}`,
    );
  }

  if (requestedAmount === 'max') {
    return maxAmount;
  }

  if (requestedAmount > maxAmount) {
    throw new UserInputError(
      `Requested merge amount ${requestedAmount} exceeds the maximum mergeable amount ${maxAmount} for condition ${conditionId}`,
    );
  }

  return requestedAmount;
}

function calculateMaxMergeAmount(balances: readonly bigint[]): bigint {
  if (balances.length !== 2) {
    throw new UnexpectedResponseError('Expected two position balances');
  }

  const [yesAmount, noAmount] = balances;

  invariant(yesAmount !== undefined, 'Expected YES position balance');
  invariant(noAmount !== undefined, 'Expected NO position balance');

  return yesAmount < noAmount ? yesAmount : noAmount;
}
