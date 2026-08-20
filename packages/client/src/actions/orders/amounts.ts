import { OrderSide, type TickSizeValue } from '@polymarket/bindings';
import { resolveRoundingConfig } from './context';
import {
  FIXED_SCALE,
  mulDiv,
  quantize,
  Rounding,
  type ScaledAmount,
  type ScaledPrice,
  scaledQuantum,
  toScaledAmount,
  toScaledPrice,
} from './fixed';

function multiplyAmountByPrice(
  amount: ScaledAmount,
  price: ScaledPrice,
  decimalPlaces: number,
  rounding: Rounding,
): bigint {
  const quantum = scaledQuantum(decimalPlaces);
  return mulDiv(amount, price, FIXED_SCALE * quantum, rounding) * quantum;
}

function divideAmountByPrice(
  amount: ScaledAmount,
  price: ScaledPrice,
  decimalPlaces: number,
  rounding: Rounding,
): bigint {
  const quantum = scaledQuantum(decimalPlaces);
  return mulDiv(amount, FIXED_SCALE, price * quantum, rounding) * quantum;
}

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
  const price = toScaledPrice(params.price);
  const size = quantize(
    toScaledAmount(params.size),
    roundConfig.size,
    Rounding.Down,
  );

  if (params.side === OrderSide.BUY) {
    return {
      offeredAmount: multiplyAmountByPrice(
        size,
        price,
        roundConfig.amount,
        Rounding.Down,
      ),
      requestedAmount: size,
    };
  }

  return {
    offeredAmount: size,
    requestedAmount: multiplyAmountByPrice(
      size,
      price,
      roundConfig.amount,
      Rounding.Down,
    ),
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
  const price = toScaledPrice(params.price);
  const amount = quantize(
    toScaledAmount(params.amount),
    roundConfig.size,
    Rounding.Down,
  );
  const rounding = params.protectPrice ? Rounding.Up : Rounding.Down;

  if (params.side === OrderSide.BUY) {
    return {
      offeredAmount: amount,
      requestedAmount: divideAmountByPrice(
        amount,
        price,
        roundConfig.amount,
        rounding,
      ),
    };
  }

  return {
    offeredAmount: amount,
    requestedAmount: multiplyAmountByPrice(
      amount,
      price,
      roundConfig.amount,
      rounding,
    ),
  };
}
