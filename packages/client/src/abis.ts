import type {
  ComboConditionId,
  CtfConditionId,
  PositionId,
  TokenId,
} from '@polymarket/bindings';
import { type EvmAddress, type HexString, invariant } from '@polymarket/types';
import { AbiFunction, AbiParameters } from 'ox';
import { makeErrorGuard, UserInputError } from './errors';
import type { CanonicalComboLegs } from './protocol';
import type { TransactionCall } from './types';

const BYTES31_HEX_LENGTH = 64;
const PROTOCOL_V2_CONDITION_ID_BYTES31_PATTERN = /^0x[0-9a-fA-F]{62}$/;
const PROTOCOL_V2_CONDITION_ID_BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ZERO_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
const ERC20_APPROVE_FUNCTION = AbiFunction.from(
  'function approve(address spender, uint256 amount)',
);
const ERC20_ALLOWANCE_FUNCTION = AbiFunction.from(
  'function allowance(address owner, address spender) view returns (uint256)',
);
const ERC20_TRANSFER_FUNCTION = AbiFunction.from(
  'function transfer(address recipient, uint256 amount)',
);
const PERPS_DEPOSIT_FUNCTION = AbiFunction.from(
  'function deposit(address token, uint256 amount, address to)',
);
const ERC1155_SET_APPROVAL_FOR_ALL_FUNCTION = AbiFunction.from(
  'function setApprovalForAll(address operator, bool approved)',
);
const ERC1155_IS_APPROVED_FOR_ALL_FUNCTION = AbiFunction.from(
  'function isApprovedForAll(address account, address operator) view returns (bool)',
);
const ERC1155_BALANCE_OF_FUNCTION = AbiFunction.from(
  'function balanceOf(address account, uint256 id) view returns (uint256)',
);
const ERC1155_BALANCE_OF_BATCH_FUNCTION = AbiFunction.from(
  'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])',
);
const CTF_SPLIT_POSITION_FUNCTION = AbiFunction.from(
  'function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
);
const CTF_MERGE_POSITIONS_FUNCTION = AbiFunction.from(
  'function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
);
const CTF_REDEEM_POSITIONS_FUNCTION = AbiFunction.from(
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)',
);
const ROUTER_SPLIT_FUNCTION = AbiFunction.from(
  'function split(bytes31 conditionId, uint256 amount)',
);
const ROUTER_MERGE_FUNCTION = AbiFunction.from(
  'function merge(bytes31 conditionId, uint256 amount)',
);
const ROUTER_REDEEM_FUNCTION = AbiFunction.from(
  'function redeem(bytes31 conditionId, uint256 outcomeIndex, uint256 amount)',
);
const COMBINATORIAL_MODULE_PREPARE_CONDITION_FUNCTION = AbiFunction.from(
  'function prepareCondition(uint256[] legs) returns (bytes31)',
);
const SAFE_MULTISEND_FUNCTION = AbiFunction.from('function multiSend(bytes)');
const PROXY_FACTORY_FUNCTION = AbiFunction.from(
  'function proxy((uint8 typeCode, address to, uint256 value, bytes data)[] calls) returns (bytes[])',
);
const BINARY_OUTCOME_PARTITION = [1n, 2n] as const;
const BINARY_OUTCOME_INDEX_SETS = [1n, 2n] as const;

/** @internal */
export const MAX_UINT256 = (1n << 256n) - 1n;

export type Erc20ApprovalCallError = UserInputError;
export const Erc20ApprovalCallError = makeErrorGuard(UserInputError);

/**
 * Creates a transaction call for `approve(address,uint256)` on an ERC-20 token.
 *
 * @throws {@link Erc20ApprovalCallError}
 * Thrown when the approval amount is invalid.
 */
export function erc20ApprovalCall(
  tokenAddress: EvmAddress,
  spender: EvmAddress,
  amount: bigint,
): TransactionCall {
  if (amount < 0n) {
    throw new UserInputError('Approval amount must be non-negative');
  }

  if (amount > MAX_UINT256) {
    throw new UserInputError('Approval amount exceeds uint256 range');
  }

  return {
    data: encodeErc20ApproveCall(spender, amount),
    to: tokenAddress,
  };
}

/** @internal */
export function erc20AllowanceCall(
  tokenAddress: EvmAddress,
  owner: EvmAddress,
  spender: EvmAddress,
): TransactionCall {
  return {
    data: AbiFunction.encodeData(ERC20_ALLOWANCE_FUNCTION, [owner, spender]),
    to: tokenAddress,
  };
}

/** @internal */
export function decodeErc20AllowanceResult(data: HexString): bigint {
  return AbiFunction.decodeResult(ERC20_ALLOWANCE_FUNCTION, data);
}

/**
 * Creates a transaction call for `setApprovalForAll(address,bool)` on an ERC-1155 token.
 */
export function erc1155ApprovalForAllCall(
  tokenAddress: EvmAddress,
  operator: EvmAddress,
  approved: boolean,
): TransactionCall {
  return {
    data: encodeErc1155SetApprovalForAllCall(operator, approved),
    to: tokenAddress,
  };
}

/** @internal */
export function erc1155IsApprovedForAllCall(
  tokenAddress: EvmAddress,
  owner: EvmAddress,
  operator: EvmAddress,
): TransactionCall {
  return {
    data: AbiFunction.encodeData(ERC1155_IS_APPROVED_FOR_ALL_FUNCTION, [
      owner,
      operator,
    ]),
    to: tokenAddress,
  };
}

/** @internal */
export function decodeErc1155IsApprovedForAllResult(data: HexString): boolean {
  return AbiFunction.decodeResult(ERC1155_IS_APPROVED_FOR_ALL_FUNCTION, data);
}

/** @internal */
export function erc1155BalanceOfCall(
  tokenAddress: EvmAddress,
  owner: EvmAddress,
  id: PositionId,
): TransactionCall {
  return {
    data: AbiFunction.encodeData(ERC1155_BALANCE_OF_FUNCTION, [
      owner,
      expectUint256(BigInt(id), 'Position ID'),
    ]),
    to: tokenAddress,
  };
}

/** @internal */
export function decodeErc1155BalanceOfResult(data: HexString): bigint {
  return AbiFunction.decodeResult(ERC1155_BALANCE_OF_FUNCTION, data);
}

/** @internal */
export function erc1155BalanceOfBatchCall(
  tokenAddress: EvmAddress,
  owner: EvmAddress,
  ids: readonly (PositionId | TokenId)[],
): TransactionCall {
  return {
    data: AbiFunction.encodeData(ERC1155_BALANCE_OF_BATCH_FUNCTION, [
      ids.map(() => owner),
      ids.map((id) => expectUint256(BigInt(id), 'id')),
    ]),
    to: tokenAddress,
  };
}

/** @internal */
export function decodeErc1155BalanceOfBatchResult(
  data: HexString,
): readonly bigint[] {
  return AbiFunction.decodeResult(ERC1155_BALANCE_OF_BATCH_FUNCTION, data);
}

export type Erc20TransferCallError = UserInputError;
export const Erc20TransferCallError = makeErrorGuard(UserInputError);

/**
 * Creates a transaction call for `transfer(address,uint256)` on an ERC-20 token.
 *
 * @throws {@link Erc20TransferCallError}
 * Thrown when the transfer amount is invalid.
 */
export function erc20TransferCall(
  tokenAddress: EvmAddress,
  recipient: EvmAddress,
  amount: bigint,
): TransactionCall {
  if (amount < 0n) {
    throw new UserInputError('Transfer amount must be non-negative');
  }

  if (amount > MAX_UINT256) {
    throw new UserInputError('Transfer amount exceeds uint256 range');
  }

  return {
    data: encodeErc20TransferCall(recipient, amount),
    to: tokenAddress,
  };
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsDepositCallError = UserInputError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PerpsDepositCallError = makeErrorGuard(UserInputError);

/**
 * Creates a transaction call for Perps `deposit(address,uint256,address)`.
 *
 * @throws {@link PerpsDepositCallError}
 * Thrown when the deposit amount is invalid.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function perpsDepositCall(
  depositContractAddress: EvmAddress,
  tokenAddress: EvmAddress,
  amount: bigint,
  to: EvmAddress,
): TransactionCall {
  if (amount <= 0n) {
    throw new UserInputError('Perps deposit amount must be positive');
  }

  return {
    data: AbiFunction.encodeData(PERPS_DEPOSIT_FUNCTION, [
      tokenAddress,
      expectUint256(amount, 'Perps deposit amount'),
      to,
    ]),
    to: depositContractAddress,
  };
}

export type CtfRedeemPositionsCallError = UserInputError;
export const CtfRedeemPositionsCallError = makeErrorGuard(UserInputError);

export type SplitPositionCallError = UserInputError;
export const SplitPositionCallError = makeErrorGuard(UserInputError);

/**
 * Creates a transaction call for `splitPosition(address,bytes32,bytes32,uint256[],uint256)`.
 * Works with both the standard and neg-risk collateral adapters.
 *
 * @remarks
 * This is a low-level transaction builder that most SDK consumers will not need.
 *
 * @throws {@link SplitPositionCallError}
 * Thrown when the amount is invalid.
 */
export function splitPositionCall(
  targetAddress: EvmAddress,
  collateralTokenAddress: EvmAddress,
  conditionId: CtfConditionId,
  amount: bigint,
): TransactionCall {
  return {
    data: encodeSplitPositionCall(collateralTokenAddress, conditionId, amount),
    to: targetAddress,
  };
}

export type MergePositionsCallError = UserInputError;
export const MergePositionsCallError = makeErrorGuard(UserInputError);

/**
 * Creates a transaction call for `mergePositions(address,bytes32,bytes32,uint256[],uint256)`.
 * Works with both the standard and neg-risk collateral adapters.
 *
 * @remarks
 * This is a low-level transaction builder that most SDK consumers will not need.
 *
 * @throws {@link MergePositionsCallError}
 * Thrown when the amount is invalid.
 */
export function mergePositionsCall(
  targetAddress: EvmAddress,
  collateralTokenAddress: EvmAddress,
  conditionId: CtfConditionId,
  amount: bigint,
): TransactionCall {
  return {
    data: encodeMergePositionsCall(collateralTokenAddress, conditionId, amount),
    to: targetAddress,
  };
}

/**
 * Creates a transaction call for `redeemPositions(address,bytes32,bytes32,uint256[])`
 * on Conditional Tokens-compatible contracts, including the collateral adapters.
 *
 * @remarks
 * This is a low-level transaction builder that most SDK consumers will not need.
 *
 * @throws {@link CtfRedeemPositionsCallError}
 * Thrown when the condition is invalid.
 */
export function ctfRedeemPositionsCall(
  conditionalTokensAddress: EvmAddress,
  collateralTokenAddress: EvmAddress,
  conditionId: CtfConditionId,
): TransactionCall {
  return {
    data: encodeCtfRedeemPositionsCall(collateralTokenAddress, conditionId),
    to: conditionalTokensAddress,
  };
}

export type SplitV2CallError = UserInputError;
export const SplitV2CallError = makeErrorGuard(UserInputError);

/**
 * Creates a transaction call for protocol v2 Router `split(bytes31,uint256)`.
 *
 * @throws {@link SplitV2CallError}
 * Thrown when the condition ID or amount is invalid.
 */
export function splitV2Call(
  routerAddress: EvmAddress,
  conditionId: ComboConditionId,
  amount: bigint,
): TransactionCall {
  return {
    data: AbiFunction.encodeData(ROUTER_SPLIT_FUNCTION, [
      normalizeProtocolV2ConditionId(conditionId),
      expectUint256(amount, 'Split amount'),
    ]),
    to: routerAddress,
  };
}

export type MergeV2CallError = UserInputError;
export const MergeV2CallError = makeErrorGuard(UserInputError);

/**
 * Creates a transaction call for protocol v2 Router `merge(bytes31,uint256)`.
 *
 * @throws {@link MergeV2CallError}
 * Thrown when the condition ID or amount is invalid.
 */
export function mergeV2Call(
  routerAddress: EvmAddress,
  conditionId: ComboConditionId,
  amount: bigint,
): TransactionCall {
  return {
    data: AbiFunction.encodeData(ROUTER_MERGE_FUNCTION, [
      normalizeProtocolV2ConditionId(conditionId),
      expectUint256(amount, 'Merge amount'),
    ]),
    to: routerAddress,
  };
}

export type RedeemV2CallError = UserInputError;
export const RedeemV2CallError = makeErrorGuard(UserInputError);

/**
 * Creates a transaction call for protocol v2 Router `redeem(bytes31,uint256,uint256)`.
 *
 * @throws {@link RedeemV2CallError}
 * Thrown when the condition ID, outcome index, or amount is invalid.
 */
export function redeemV2Call(
  routerAddress: EvmAddress,
  conditionId: ComboConditionId,
  outcomeIndex: 0 | 1,
  amount: bigint,
): TransactionCall {
  return {
    data: AbiFunction.encodeData(ROUTER_REDEEM_FUNCTION, [
      normalizeProtocolV2ConditionId(conditionId),
      BigInt(expectProtocolV2OutcomeIndex(outcomeIndex)),
      expectUint256(amount, 'Redeem amount'),
    ]),
    to: routerAddress,
  };
}

export type CombinatorialPrepareConditionCallError = UserInputError;
export const CombinatorialPrepareConditionCallError =
  makeErrorGuard(UserInputError);

/**
 * Creates a transaction call for CombinatorialModule `prepareCondition(uint256[])`.
 *
 * @throws {@link CombinatorialPrepareConditionCallError}
 * Thrown when any leg position ID is invalid.
 */
export function combinatorialPrepareConditionCall(
  combinatorialModuleAddress: EvmAddress,
  legs: CanonicalComboLegs,
): TransactionCall {
  return {
    data: AbiFunction.encodeData(
      COMBINATORIAL_MODULE_PREPARE_CONDITION_FUNCTION,
      [legs.map((leg) => expectUint256(leg, 'Leg position ID'))],
    ),
    to: combinatorialModuleAddress,
  };
}

function encodeErc20ApproveCall(
  spender: EvmAddress,
  amount: bigint,
): HexString {
  invariant(amount >= 0n, 'Approval amount must be non-negative');

  return AbiFunction.encodeData(ERC20_APPROVE_FUNCTION, [spender, amount]);
}

function encodeErc1155SetApprovalForAllCall(
  operator: EvmAddress,
  approved: boolean,
): HexString {
  return AbiFunction.encodeData(ERC1155_SET_APPROVAL_FOR_ALL_FUNCTION, [
    operator,
    approved,
  ]);
}

function encodeErc20TransferCall(
  recipient: EvmAddress,
  amount: bigint,
): HexString {
  return AbiFunction.encodeData(ERC20_TRANSFER_FUNCTION, [recipient, amount]);
}

function encodeSplitPositionCall(
  collateralTokenAddress: EvmAddress,
  conditionId: CtfConditionId,
  amount: bigint,
): HexString {
  return AbiFunction.encodeData(CTF_SPLIT_POSITION_FUNCTION, [
    collateralTokenAddress,
    ZERO_BYTES32,
    conditionId,
    BINARY_OUTCOME_PARTITION,
    expectUint256(amount, 'Split amount'),
  ]);
}

function encodeMergePositionsCall(
  collateralTokenAddress: EvmAddress,
  conditionId: CtfConditionId,
  amount: bigint,
): HexString {
  return AbiFunction.encodeData(CTF_MERGE_POSITIONS_FUNCTION, [
    collateralTokenAddress,
    ZERO_BYTES32,
    conditionId,
    BINARY_OUTCOME_PARTITION,
    expectUint256(amount, 'Merge amount'),
  ]);
}

function encodeCtfRedeemPositionsCall(
  collateralTokenAddress: EvmAddress,
  conditionId: CtfConditionId,
): HexString {
  return AbiFunction.encodeData(CTF_REDEEM_POSITIONS_FUNCTION, [
    collateralTokenAddress,
    ZERO_BYTES32,
    conditionId,
    BINARY_OUTCOME_INDEX_SETS,
  ]);
}

function expectUint256(value: bigint, label: string): bigint {
  if (value < 0n) {
    throw new UserInputError(`${label} must be non-negative`);
  }

  if (value > MAX_UINT256) {
    throw new UserInputError(`${label} exceeds uint256 range`);
  }

  return value;
}

function normalizeProtocolV2ConditionId(
  conditionId: ComboConditionId,
): HexString {
  if (PROTOCOL_V2_CONDITION_ID_BYTES31_PATTERN.test(conditionId)) {
    return conditionId.toLowerCase() as HexString;
  }

  if (PROTOCOL_V2_CONDITION_ID_BYTES32_PATTERN.test(conditionId)) {
    const normalized = conditionId.toLowerCase();
    if (normalized.endsWith('00') || normalized.endsWith('01')) {
      return normalized.slice(0, BYTES31_HEX_LENGTH) as HexString;
    }
  }

  throw new UserInputError(
    'Protocol v2 condition ID must be bytes31, or bytes32 with a binary outcome byte',
  );
}

function expectProtocolV2OutcomeIndex(outcomeIndex: 0 | 1): 0 | 1 {
  if (outcomeIndex !== 0 && outcomeIndex !== 1) {
    throw new UserInputError('Protocol v2 outcome index must be 0 or 1');
  }

  return outcomeIndex;
}

/** @internal */
export function encodeProxyCall(calls: readonly TransactionCall[]): HexString {
  return AbiFunction.encodeData(PROXY_FACTORY_FUNCTION, [
    calls.map((call) => ({
      typeCode: 1,
      to: call.to,
      value: call.value ?? 0n,
      data: call.data,
    })),
  ]);
}

/** @internal */
export function encodeSafeMultisendCall(
  calls: readonly TransactionCall[],
): HexString {
  const encodedTransactions = calls.map((call) =>
    encodeSafeMultisendTransaction(call),
  );

  return AbiFunction.encodeData(SAFE_MULTISEND_FUNCTION, [
    encodedTransactions.length === 0
      ? '0x'
      : AbiParameters.encodePacked(
          Array.from({ length: encodedTransactions.length }, () => 'bytes'),
          encodedTransactions,
        ),
  ]);
}

function encodeSafeMultisendTransaction(call: TransactionCall): HexString {
  const value = call.value ?? 0n;

  return AbiParameters.encodePacked(
    ['uint8', 'address', 'uint256', 'uint256', 'bytes'],
    [0, call.to, value, BigInt((call.data.length - 2) / 2), call.data],
  );
}
