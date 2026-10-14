import type {
  ConditionId,
  MarketId,
  PositionId,
  TokenId,
} from '@polymarket/bindings';
import { ConditionIdSchema } from '@polymarket/bindings';
import { type Market, ProtocolVersion } from '@polymarket/bindings/gamma';
import {
  DirectionalConditionIdSchema,
  deriveOutcomePositionId,
} from '@polymarket/bindings/protocol';
import { isPresent } from '@polymarket/types';
import { z } from 'zod';
import { UnexpectedResponseError } from '../errors';
import { isV2ConditionId } from '../protocol';

export enum PositionProtocol {
  CTF = 'ctf',
  V2 = 'v2',
}

function isDirectionalConditionId(conditionId: ConditionId): boolean {
  return (
    isV2ConditionId(conditionId) && conditionId.toLowerCase().startsWith('0x04')
  );
}

// Legacy IDs are full-width hashes outside the reserved V2 namespace, so a
// legacy hash with a 0x04 prefix stays on the existing path. Directional
// conditions are validated and normalized to bytes31; every other condition ID
// is parsed exactly as before.
export const PositionConditionIdSchema = z.union([
  ConditionIdSchema.refine(isDirectionalConditionId)
    .transform(String)
    .pipe(DirectionalConditionIdSchema),
  ConditionIdSchema.refine(
    (conditionId) => !isDirectionalConditionId(conditionId),
  ),
]);

export type DirectionalConditionPositionContext = {
  protocol: PositionProtocol.V2;
  conditionId: ConditionId;
  outcomeIds: [yes: PositionId, no: PositionId];
};

/**
 * Resolves a directional condition parsed by {@link PositionConditionIdSchema}
 * without a market listing. Returns `undefined` for every other condition.
 */
export function resolveDirectionalConditionPositionContext(
  conditionId: ConditionId,
): DirectionalConditionPositionContext | undefined {
  if (conditionId.length !== 64 || !conditionId.startsWith('0x04')) {
    return undefined;
  }

  return {
    protocol: PositionProtocol.V2,
    conditionId,
    outcomeIds: [
      deriveOutcomePositionId(conditionId, 0),
      deriveOutcomePositionId(conditionId, 1),
    ],
  };
}

type MarketPositionContextBase = {
  marketId: MarketId;
  conditionId: ConditionId;
};

type NormalizedCtfMarketPositionContext = MarketPositionContextBase & {
  protocol: PositionProtocol.CTF;
  negRisk: boolean;
  outcomeIds: [yes: TokenId, no: TokenId];
};

type NormalizedV2MarketPositionContext = MarketPositionContextBase & {
  protocol: PositionProtocol.V2;
  outcomeIds: [yes: PositionId, no: PositionId];
};

export function normalizeMarketPositionContext(
  market: Market,
  context: string,
): NormalizedCtfMarketPositionContext | NormalizedV2MarketPositionContext {
  if (!isPresent(market.conditionId)) {
    throw new UnexpectedResponseError(`Missing condition ID for ${context}`);
  }

  if (!isPresent(market.version)) {
    throw new UnexpectedResponseError(`Missing market version for ${context}`);
  }

  const yesTokenId = market.outcomes.yes.tokenId;
  const noTokenId = market.outcomes.no.tokenId;
  const yesPositionId = market.outcomes.yes.positionId;
  const noPositionId = market.outcomes.no.positionId;

  if (market.version === ProtocolVersion.V2) {
    if (isPresent(yesPositionId) !== isPresent(noPositionId)) {
      throw new UnexpectedResponseError(
        `Incomplete market position IDs for ${context}`,
      );
    }

    if (!isPresent(yesPositionId) || !isPresent(noPositionId)) {
      throw new UnexpectedResponseError(
        `Missing market position IDs for ${context}`,
      );
    }

    return {
      marketId: market.id,
      conditionId: market.conditionId,
      protocol: PositionProtocol.V2,
      outcomeIds: [yesPositionId, noPositionId],
    };
  }

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

  throw new UnexpectedResponseError(`Missing market token IDs for ${context}`);
}
