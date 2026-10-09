import type { PositionId } from '@polymarket/bindings';
import {
  decodeProtocolEventId,
  deriveProtocolConditionId,
  deriveProtocolPositionId,
  type ProtocolEventId,
  ThresholdSide,
} from '@polymarket/bindings/protocol';
import {
  decodeErc1155BalanceOfBatchResult,
  erc1155BalanceOfBatchCall,
} from '../abis';
import type { BaseSecureClient } from '../clients';
import { UnexpectedResponseError, UserInputError } from '../errors';

/**
 * Returns every real YES position of an event, followed by the synthetic Other
 * or Void YES position.
 */
export function eventYesPositionIds(eventId: ProtocolEventId): PositionId[] {
  const { arity } = decodeProtocolEventId(eventId);
  return yesPositionIds(eventId, 0, arity + 1);
}

/**
 * Returns the bucket YES positions that make up one side of a threshold.
 * ABOVE is `[line, arity)`; BELOW is `[0, line)` plus Void.
 */
export function thresholdBasketPositionIds(
  eventId: ProtocolEventId,
  line: number,
  side: ThresholdSide,
): PositionId[] {
  const { arity } = decodeProtocolEventId(eventId);
  if (side === ThresholdSide.Above) {
    return yesPositionIds(eventId, line, arity);
  }

  return [
    ...yesPositionIds(eventId, 0, line),
    ...yesPositionIds(eventId, arity, arity + 1),
  ];
}

/** Returns the real bucket YES positions in `[lowLine, highLine)`. */
export function bucketRangePositionIds(
  eventId: ProtocolEventId,
  lowLine: number,
  highLine: number,
): PositionId[] {
  return yesPositionIds(eventId, lowLine, highLine);
}

function yesPositionIds(
  eventId: ProtocolEventId,
  start: number,
  end: number,
): PositionId[] {
  const positionIds: PositionId[] = [];
  for (let index = start; index < end; index += 1) {
    positionIds.push(
      deriveProtocolPositionId(deriveProtocolConditionId(eventId, index), 0),
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
): Promise<bigint> {
  const balances = decodeErc1155BalanceOfBatchResult(
    await client.rpc.ethCall(
      erc1155BalanceOfBatchCall(
        client.environment.contracts.positionManager,
        client.account.wallet,
        positionIds,
      ),
    ),
  );

  if (balances.length !== positionIds.length) {
    throw new UnexpectedResponseError('Expected one balance per position');
  }

  const maxAmount = balances.reduce((min, balance) =>
    balance < min ? balance : min,
  );
  const limitingPositionId = positionIds[balances.indexOf(maxAmount)];

  if (maxAmount === 0n) {
    throw new UserInputError(
      `You have no balance of required position ${limitingPositionId}`,
    );
  }

  if (requestedAmount === 'max') {
    return maxAmount;
  }

  if (requestedAmount > maxAmount) {
    throw new UserInputError(
      `Requested amount ${requestedAmount} exceeds the available balance ${maxAmount} of position ${limitingPositionId}`,
    );
  }

  return requestedAmount;
}
