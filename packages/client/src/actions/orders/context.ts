import type { TickSizeValue } from '@polymarket/bindings';
import type { EvmAddress } from '@polymarket/types';
import { invariant } from '@polymarket/types';
import type { BaseSecureClient } from '../../clients';
import { UserInputError } from '../../errors';
import { decimalPlaces, isMultipleOf } from './math';

export type RoundingConfig = {
  amount: number;
  price: number;
  size: number;
};

export function resolveRoundingConfig(tickSize: TickSizeValue): RoundingConfig {
  switch (tickSize) {
    case 0.1:
      return { amount: 3, price: 1, size: 2 };
    case 0.01:
      return { amount: 4, price: 2, size: 2 };
    case 0.005:
      return { amount: 5, price: 3, size: 2 };
    case 0.0025:
      return { amount: 6, price: 4, size: 2 };
    case 0.001:
      return { amount: 5, price: 3, size: 2 };
    case 0.0001:
      return { amount: 6, price: 4, size: 2 };
  }

  invariant(false, `Unsupported tick size: ${tickSize}`);
}

/**
 * Validates that a user-supplied order price lies on the market's tick grid
 * within `[tickSize, 1 - tickSize]` and returns it unchanged.
 *
 * Grid membership is fully determined by the tick size: valid prices have at
 * most as many decimals as the tick and are integer multiples of it. This
 * mirrors the exchange's own validation, which divides the price by the
 * market's minimum tick and requires an integer result.
 *
 * @internal
 */
export function validatePriceOnTickGrid(
  price: number,
  tickSize: TickSizeValue,
): number {
  const tickDecimals = decimalPlaces(tickSize);

  if (price < tickSize || price > 1 - tickSize) {
    throw new UserInputError(
      `must be between ${tickSize} and ${1 - tickSize} for tick size ${tickSize}.`,
    );
  }

  if (decimalPlaces(price) > tickDecimals) {
    throw new UserInputError(
      `must conform to tick size ${tickSize} with at most ${tickDecimals} decimal places.`,
    );
  }

  if (!isMultipleOf(price, tickSize)) {
    throw new UserInputError(
      `${price} must be a multiple of tick size ${tickSize}.`,
    );
  }

  return price;
}

export function resolveExchangeAddress(
  client: BaseSecureClient,
  negRisk: boolean,
): EvmAddress {
  return negRisk
    ? client.environment.contracts.negRiskExchange
    : client.environment.contracts.standardExchange;
}
