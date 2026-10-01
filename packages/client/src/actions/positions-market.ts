import type {
  ConditionId,
  MarketId,
  PositionId,
  TokenId,
} from '@polymarket/bindings';
import { type Market, ProtocolVersion } from '@polymarket/bindings/gamma';
import { isPresent } from '@polymarket/types';
import { UnexpectedResponseError } from '../errors';

export enum PositionProtocol {
  CTF = 'ctf',
  V2 = 'v2',
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
