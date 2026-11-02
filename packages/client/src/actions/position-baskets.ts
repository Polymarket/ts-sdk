import type { PositionId } from '@polymarket/bindings';
import {
  type DirectionalEventId,
  decodeDirectionalEventId,
  deriveBucketConditionId,
  deriveOutcomePositionId,
  ThresholdSide,
} from '@polymarket/bindings/protocol';
import { invariant } from '@polymarket/types';
import {
  decodeErc20BalanceOfResult,
  decodeErc1155BalanceOfBatchResult,
  erc20BalanceOfCall,
  erc1155BalanceOfBatchCall,
} from '../abis';
import type { BaseSecureClient } from '../clients';
import { UnexpectedResponseError, UserInputError } from '../errors';

/**
 * Returns every real bucket YES position of an event, followed by the Void YES
 * position.
 */
export function eventYesPositionIds(eventId: DirectionalEventId): PositionId[] {
  const { bucketCount } = decodeDirectionalEventId(eventId);
  return yesPositionIds(eventId, 0, bucketCount + 1);
}

/**
 * Returns the bucket YES positions that make up one side of a threshold.
 * ABOVE is `[line, bucketCount)`; BELOW is `[0, line)` plus Void.
 */
export function thresholdBasketPositionIds(
  eventId: DirectionalEventId,
  line: number,
  side: ThresholdSide,
): PositionId[] {
  const { bucketCount } = decodeDirectionalEventId(eventId);
  if (side === ThresholdSide.Above) {
    return yesPositionIds(eventId, line, bucketCount);
  }

  return [
    ...yesPositionIds(eventId, 0, line),
    ...yesPositionIds(eventId, bucketCount, bucketCount + 1),
  ];
}

/** Returns the real bucket YES positions in `[lowLine, highLine)`. */
export function bucketRangePositionIds(
  eventId: DirectionalEventId,
  lowLine: number,
  highLine: number,
): PositionId[] {
  return yesPositionIds(eventId, lowLine, highLine);
}

function yesPositionIds(
  eventId: DirectionalEventId,
  start: number,
  end: number,
): PositionId[] {
  const positionIds: PositionId[] = [];
  for (let index = start; index < end; index += 1) {
    positionIds.push(
      deriveOutcomePositionId(deriveBucketConditionId(eventId, index), 0),
    );
  }
  return positionIds;
}

/**
 * Reads the wallet's balance of every position an operation consumes and
 * resolves the amount to use. `'max'` resolves to the smallest balance.
 */
export async function resolveBasketAmount(
  client: BaseSecureClient,
  positionIds: readonly PositionId[],
  requestedAmount: bigint | 'max',
  options: { collateral?: boolean } = {},
): Promise<bigint> {
  const basketCall = erc1155BalanceOfBatchCall(
    client.environment.contracts.positionManager,
    client.account.wallet,
    positionIds,
  );
  const results = await client.rpc.ethCallBatch(
    options.collateral
      ? [
          basketCall,
          erc20BalanceOfCall(
            client.environment.contracts.collateralToken,
            client.account.wallet,
          ),
        ]
      : [basketCall],
  );
  const basketResult = results[0];
  invariant(basketResult !== undefined, 'Expected a basket balance result');
  const balances = [...decodeErc1155BalanceOfBatchResult(basketResult)];

  if (balances.length !== positionIds.length) {
    throw new UnexpectedResponseError('Expected one balance per position');
  }

  const requiredAssets: string[] = [...positionIds];
  if (options.collateral) {
    const collateralResult = results[1];
    invariant(
      collateralResult !== undefined,
      'Expected a collateral balance result',
    );
    balances.push(decodeErc20BalanceOfResult(collateralResult));
    requiredAssets.push('pUSD');
  }
  return resolveAvailableAmount(
    balances.map((balance, index) => ({
      asset: requiredAssets[index] ?? 'position',
      balance,
    })),
    requestedAmount,
  );
}

/** Resolves an amount against every asset consumed by one atomic operation. */
export function resolveAvailableAmount(
  assets: readonly { asset: string; balance: bigint }[],
  requestedAmount: bigint | 'max',
): bigint {
  const balances = assets.map(({ balance }) => balance);
  const maxAmount = balances.reduce((min, balance) =>
    balance < min ? balance : min,
  );
  const limitingAsset = assets[balances.indexOf(maxAmount)]?.asset;

  if (maxAmount === 0n) {
    throw new UserInputError(
      `You have no balance of required asset ${limitingAsset}`,
    );
  }

  if (requestedAmount === 'max') {
    return maxAmount;
  }

  if (requestedAmount > maxAmount) {
    throw new UserInputError(
      `Requested amount ${requestedAmount} exceeds the available balance ${maxAmount} of asset ${limitingAsset}`,
    );
  }

  return requestedAmount;
}
