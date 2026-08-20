import { OrderSide, type TickSizeValue } from '@polymarket/bindings';
import { resolveRoundingConfig } from './context';
import {
  decimalPlaces,
  parseAmount,
  roundDown,
  roundNormal,
  roundUp,
} from './math';

export function computeLimitOrderAmounts(params: {
  price: number;
  side: OrderSide;
  size: number;
  tickSize: TickSizeValue;
}): {
  offeredAmount: bigint;
  requestedAmount: bigint;
} {
  const roundConfig = resolveRoundingConfig(params.tickSize);
  const rawPrice = roundNormal(params.price, roundConfig.price);

  if (params.side === OrderSide.BUY) {
    const rawTakerAmount = roundDown(params.size, roundConfig.size);
    let rawMakerAmount = rawTakerAmount * rawPrice;

    if (decimalPlaces(rawMakerAmount) > roundConfig.amount) {
      rawMakerAmount = roundUp(rawMakerAmount, roundConfig.amount + 4);

      if (decimalPlaces(rawMakerAmount) > roundConfig.amount) {
        rawMakerAmount = roundDown(rawMakerAmount, roundConfig.amount);
      }
    }

    return {
      offeredAmount: parseAmount(rawMakerAmount),
      requestedAmount: parseAmount(rawTakerAmount),
    };
  }

  const rawMakerAmount = roundDown(params.size, roundConfig.size);
  let rawTakerAmount = rawMakerAmount * rawPrice;

  if (decimalPlaces(rawTakerAmount) > roundConfig.amount) {
    rawTakerAmount = roundUp(rawTakerAmount, roundConfig.amount + 4);

    if (decimalPlaces(rawTakerAmount) > roundConfig.amount) {
      rawTakerAmount = roundDown(rawTakerAmount, roundConfig.amount);
    }
  }

  return {
    offeredAmount: parseAmount(rawMakerAmount),
    requestedAmount: parseAmount(rawTakerAmount),
  };
}

export function computeMarketOrderAmounts(params: {
  amount: number;
  price: number;
  protectPrice?: boolean;
  side: OrderSide;
  tickSize: TickSizeValue;
}): {
  offeredAmount: bigint;
  requestedAmount: bigint;
} {
  const roundConfig = resolveRoundingConfig(params.tickSize);
  const rawPrice = roundDown(params.price, roundConfig.price);
  const rawMakerAmount = roundDown(params.amount, roundConfig.size);

  if (params.side === OrderSide.BUY) {
    let rawTakerAmount = rawMakerAmount / rawPrice;

    if (decimalPlaces(rawTakerAmount) > roundConfig.amount) {
      rawTakerAmount = roundUp(rawTakerAmount, roundConfig.amount + 4);

      if (decimalPlaces(rawTakerAmount) > roundConfig.amount) {
        rawTakerAmount = params.protectPrice
          ? roundUp(rawTakerAmount, roundConfig.amount)
          : roundDown(rawTakerAmount, roundConfig.amount);
      }
    }

    return {
      offeredAmount: parseAmount(rawMakerAmount),
      requestedAmount: parseAmount(rawTakerAmount),
    };
  }

  let rawTakerAmount = rawMakerAmount * rawPrice;

  if (decimalPlaces(rawTakerAmount) > roundConfig.amount) {
    rawTakerAmount = roundUp(rawTakerAmount, roundConfig.amount + 4);

    if (decimalPlaces(rawTakerAmount) > roundConfig.amount) {
      rawTakerAmount = params.protectPrice
        ? roundUp(rawTakerAmount, roundConfig.amount)
        : roundDown(rawTakerAmount, roundConfig.amount);
    }
  }

  return {
    offeredAmount: parseAmount(rawMakerAmount),
    requestedAmount: parseAmount(rawTakerAmount),
  };
}
