import type { TickSizeValue } from '@polymarket/bindings';
import type { EvmAddress } from '@polymarket/types';
import { invariant } from '@polymarket/types';
import type { BaseSecureClient } from '../../clients';
import { UserInputError } from '../../errors';
import { ExchangeOrderProtocolVersion } from '../../exchange';
import type { OrderRouting } from './asset';
import { FIXED_SCALE, type ScaledPrice, toScaledPrice } from './fixed';

export type RoundingConfig = {
  amount: number;
  size: number;
};

export function resolveRoundingConfig(tickSize: TickSizeValue): RoundingConfig {
  switch (tickSize) {
    case 0.1:
      return { amount: 3, size: 2 };
    case 0.01:
      return { amount: 4, size: 2 };
    case 0.005:
      return { amount: 5, size: 2 };
    case 0.0025:
      return { amount: 6, size: 2 };
    case 0.001:
      return { amount: 5, size: 2 };
    case 0.0001:
      return { amount: 6, size: 2 };
  }

  invariant(false, `Unsupported tick size: ${tickSize}`);
}

/**
 * Normalizes a user-supplied order price to six-decimal fixed point and
 * validates that it lies on the market's tick grid within
 * `[tickSize, 1 - tickSize]`.
 *
 * Grid membership is checked with integer modulo after the conversion boundary
 * has rejected unsupported precision. This mirrors the exchange's own
 * validation, which divides the price by the market's minimum tick and requires
 * an integer result.
 *
 * @internal
 */
export function validatePriceOnTickGrid(
  price: number,
  tickSize: TickSizeValue,
): ScaledPrice {
  const scaledPrice = toScaledPrice(price);
  const scaledTick = toScaledPrice(tickSize);

  if (scaledPrice < scaledTick || scaledPrice > FIXED_SCALE - scaledTick) {
    throw new UserInputError(
      `must be between ${tickSize} and ${1 - tickSize} for tick size ${tickSize}.`,
    );
  }

  if (scaledPrice % scaledTick !== 0n) {
    throw new UserInputError(
      `${price} must be a multiple of tick size ${tickSize}.`,
    );
  }

  return scaledPrice;
}

export function resolveExchangeAddress(
  client: BaseSecureClient,
  negRisk: boolean,
): EvmAddress {
  return negRisk
    ? client.environment.contracts.negRiskExchange
    : client.environment.contracts.standardExchange;
}

/** @internal */
export function resolveOrderExchangeAddress(
  client: BaseSecureClient,
  routing: OrderRouting,
  negRisk: boolean,
): EvmAddress {
  return routing.exchangeVersion === ExchangeOrderProtocolVersion.V3
    ? client.environment.contracts.exchangeV3
    : resolveExchangeAddress(client, negRisk);
}
