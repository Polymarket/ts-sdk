import {
  OrderSide,
  OrderSideSchema,
  toDecimalString,
} from '@polymarket/bindings';
import {
  PerpsAutoCancelResponseSchema,
  PerpsCancelAllOrdersResponseSchema,
  type PerpsCancelOrderResult,
  PerpsCancelOrderResultSchema,
  type PerpsClientOrderId,
  PerpsClientOrderIdSchema,
  PerpsCommandAckSchema,
  type PerpsDecimalInput,
  PerpsDecimalInputSchema,
  type PerpsInstrumentId,
  PerpsInstrumentIdSchema,
  type PerpsOrder,
  type PerpsOrderId,
  PerpsOrderIdSchema,
  type PerpsPortfolio,
  type PerpsPostOrderAck,
  PerpsPostOrderAckSchema,
  PerpsTimeInForce,
  PerpsTpSlKind,
  PerpsTpSlScope,
  type PerpsUpdateLeverageResult,
  PerpsUpdateLeverageResultSchema,
} from '@polymarket/bindings/perps';
import type {
  PerpsOrderUpdateEvent,
  PerpsSessionEvent,
} from '@polymarket/bindings/subscriptions';
import { expectPresent, invariant, unwrap } from '@polymarket/types';
import { z } from 'zod';
import {
  AutoCancelDailyLimitError,
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../../../errors';
import { parseUserInput } from '../../../input';
import { validateWith } from '../../../response';
import type { ServiceClient } from '../../../ServiceClient';
import type { PerpsSignedOp } from '../signing';

const PerpsOrderBaseInputSchema = z.object({
  instrumentId: PerpsInstrumentIdSchema,
  side: OrderSideSchema,
  quantity: PerpsDecimalInputSchema,
  reduceOnly: z.boolean().default(false),
  clientOrderId: PerpsClientOrderIdSchema.optional(),
});

/**
 * Good-til-cancelled Perps order.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPlaceGtcOrderRequest = {
  /** Perps instrument identifier to trade. */
  instrumentId: number;
  /** Trade direction. */
  side: OrderSide;
  /** Limit price. */
  price: PerpsDecimalInput;
  /** Order quantity. */
  quantity: PerpsDecimalInput;
  /** Good-til-cancelled execution. */
  timeInForce: PerpsTimeInForce.GTC;
  /** Whether the order must rest instead of taking liquidity. */
  postOnly?: boolean;
  /** Whether the order may only reduce or close an existing position. */
  reduceOnly?: boolean;
  /** Optional caller-supplied idempotency identifier. */
  clientOrderId?: string;
};

const PerpsPlaceGtcOrderRequestSchema = PerpsOrderBaseInputSchema.extend({
  price: PerpsDecimalInputSchema,
  timeInForce: z.literal(PerpsTimeInForce.GTC),
  postOnly: z.boolean().default(false),
}) satisfies z.ZodType<PerpsPlaceGtcOrderRequest>;

/**
 * Immediate-or-cancel Perps order.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPlaceIocOrderRequest = {
  /** Perps instrument identifier to trade. */
  instrumentId: number;
  /** Trade direction. */
  side: OrderSide;
  /** Optional limit price. Omit for market-style execution. */
  price?: PerpsDecimalInput;
  /** Order quantity. */
  quantity: PerpsDecimalInput;
  /** Immediate-or-cancel execution. */
  timeInForce: PerpsTimeInForce.IOC;
  postOnly?: never;
  /** Whether the order may only reduce or close an existing position. */
  reduceOnly?: boolean;
  /** Optional caller-supplied idempotency identifier. */
  clientOrderId?: string;
};

const PerpsPlaceIocOrderRequestSchema = PerpsOrderBaseInputSchema.extend({
  price: PerpsDecimalInputSchema.optional(),
  timeInForce: z.literal(PerpsTimeInForce.IOC),
  postOnly: z.never().optional(),
}) satisfies z.ZodType<PerpsPlaceIocOrderRequest>;

/**
 * Fill-or-kill Perps order.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPlaceFokOrderRequest = {
  /** Perps instrument identifier to trade. */
  instrumentId: number;
  /** Trade direction. */
  side: OrderSide;
  /** Optional limit price. Omit for market-style execution. */
  price?: PerpsDecimalInput;
  /** Order quantity. */
  quantity: PerpsDecimalInput;
  /** Fill-or-kill execution. */
  timeInForce: PerpsTimeInForce.FOK;
  postOnly?: never;
  /** Whether the order may only reduce or close an existing position. */
  reduceOnly?: boolean;
  /** Optional caller-supplied idempotency identifier. */
  clientOrderId?: string;
};

const PerpsPlaceFokOrderRequestSchema = PerpsOrderBaseInputSchema.extend({
  price: PerpsDecimalInputSchema.optional(),
  timeInForce: z.literal(PerpsTimeInForce.FOK),
  postOnly: z.never().optional(),
}) satisfies z.ZodType<PerpsPlaceFokOrderRequest>;

/**
 * Request parameters for one Perps order.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsOrderRequest =
  | PerpsPlaceGtcOrderRequest
  | PerpsPlaceIocOrderRequest
  | PerpsPlaceFokOrderRequest;

const PerpsOrderRequestSchema = z.discriminatedUnion('timeInForce', [
  PerpsPlaceGtcOrderRequestSchema,
  PerpsPlaceIocOrderRequestSchema,
  PerpsPlaceFokOrderRequestSchema,
]) satisfies z.ZodType<PerpsOrderRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsTpSlTrigger = {
  triggerPrice: PerpsDecimalInput;
  limitPrice?: PerpsDecimalInput;
};

const PerpsTpSlTriggerSchema = z.object({
  triggerPrice: PerpsDecimalInputSchema,
  limitPrice: PerpsDecimalInputSchema.optional(),
}) satisfies z.ZodType<PerpsTpSlTrigger>;

const PerpsPositionTpSlTriggerSchema = z.object({
  triggerPrice: PerpsDecimalInputSchema,
}) satisfies z.ZodType<PerpsPositionTpSlTrigger>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPositionTpSlTrigger = {
  triggerPrice: PerpsDecimalInput;
};

type PerpsTpSlPairRequest =
  | { takeProfit: PerpsTpSlTrigger; stopLoss?: PerpsTpSlTrigger }
  | { takeProfit?: PerpsTpSlTrigger; stopLoss: PerpsTpSlTrigger };

const PerpsTpSlPairSchema = z.union([
  z.object({
    takeProfit: PerpsTpSlTriggerSchema,
    stopLoss: PerpsTpSlTriggerSchema.optional(),
  }),
  z.object({
    takeProfit: PerpsTpSlTriggerSchema.optional(),
    stopLoss: PerpsTpSlTriggerSchema,
  }),
]) satisfies z.ZodType<PerpsTpSlPairRequest>;

/** @internal */
export type PerpsCommandRequest = {
  op: PerpsSignedOp;
  expiresAt?: number;
};

/** @internal */
export type PerpsCommandExecutor = {
  /** @internal */
  executeCommand<T>(
    request: PerpsCommandRequest,
    responseSchema: z.ZodType<T>,
  ): Promise<T>;
};

/** @internal */
export type PerpsEventCommandExecutor = PerpsCommandExecutor & {
  /** @internal */
  executeCommandWithEvent<TResponse, TEvent extends PerpsSessionEvent>(
    request: PerpsCommandRequest,
    responseSchema: z.ZodType<TResponse>,
    predicate: (event: PerpsSessionEvent) => event is TEvent,
  ): Promise<readonly [TResponse, TEvent]>;
};

/** @internal */
export type PerpsDeleteCommandRequest<T> = PerpsCommandRequest & {
  path: string;
  responseSchema: z.ZodType<T>;
};

/** @internal */
export type PerpsDeleteCommandExecutor = {
  /** @internal */
  executeDeleteCommand<T>(request: PerpsDeleteCommandRequest<T>): Promise<T>;
};

/** @internal */
export type SignPerpsRestCommand = (
  op: PerpsSignedOp,
  expiresAt?: number,
) => Record<string, unknown>;

/**
 * Request parameters for posting one or more Perps orders.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PostPerpsOrdersRequest = {
  /** Orders to post as one command. */
  orders: PerpsOrderRequest[];
  /** Optional command expiration timestamp in milliseconds. */
  expiresAt?: number;
};

const PostPerpsOrdersRequestSchema = z.object({
  orders: z.array(PerpsOrderRequestSchema).min(1),
  expiresAt: z.number().int().positive().optional(),
}) satisfies z.ZodType<PostPerpsOrdersRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function postPerpsOrders(
  client: PerpsCommandExecutor,
  request: PostPerpsOrdersRequest,
): Promise<PerpsPostOrderAck[]> {
  const params = parseUserInput(request, PostPerpsOrdersRequestSchema);
  return await client.executeCommand(
    {
      op: ['createOrders', params.orders.map(toRawPerpsOrder)],
      expiresAt: params.expiresAt,
    },
    z.array(PerpsPostOrderAckSchema),
  );
}

const PlacePerpsOrderWithTpSlRequestSchema = z.intersection(
  PerpsOrderRequestSchema,
  z.intersection(
    PerpsTpSlPairSchema,
    z.object({
      clientOrderId: PerpsClientOrderIdSchema.default(randomClientOrderId),
      expiresAt: z.number().int().positive().optional(),
    }),
  ),
) satisfies z.ZodType<PlacePerpsOrderWithTpSlRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PlacePerpsOrderRequest =
  | {
      /** Perps instrument identifier to trade. */
      instrumentId: number;
      /** Trade direction. */
      side: OrderSide;
      /** Limit price. */
      price: PerpsDecimalInput;
      /** Order quantity. */
      quantity: PerpsDecimalInput;
      /** Good-til-cancelled execution. */
      timeInForce: PerpsTimeInForce.GTC;
      /** Whether the order must rest instead of taking liquidity. */
      postOnly?: boolean;
      /** Whether the order may only reduce or close an existing position. */
      reduceOnly?: boolean;
      /** Optional caller-supplied idempotency identifier. Generated when omitted. */
      clientOrderId?: string;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
      takeProfit?: never;
      stopLoss?: never;
    }
  | {
      /** Perps instrument identifier to trade. */
      instrumentId: number;
      /** Trade direction. */
      side: OrderSide;
      /** Optional limit price. Omit for market-style execution. */
      price?: PerpsDecimalInput;
      /** Order quantity. */
      quantity: PerpsDecimalInput;
      /** Immediate-or-cancel execution. */
      timeInForce: PerpsTimeInForce.IOC;
      postOnly?: never;
      /** Whether the order may only reduce or close an existing position. */
      reduceOnly?: boolean;
      /** Optional caller-supplied idempotency identifier. Generated when omitted. */
      clientOrderId?: string;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
      takeProfit?: never;
      stopLoss?: never;
    }
  | {
      /** Perps instrument identifier to trade. */
      instrumentId: number;
      /** Trade direction. */
      side: OrderSide;
      /** Optional limit price. Omit for market-style execution. */
      price?: PerpsDecimalInput;
      /** Order quantity. */
      quantity: PerpsDecimalInput;
      /** Fill-or-kill execution. */
      timeInForce: PerpsTimeInForce.FOK;
      postOnly?: never;
      /** Whether the order may only reduce or close an existing position. */
      reduceOnly?: boolean;
      /** Optional caller-supplied idempotency identifier. Generated when omitted. */
      clientOrderId?: string;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
      takeProfit?: never;
      stopLoss?: never;
    };

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PlacePerpsOrderWithTpSlRequest =
  | {
      /** Perps instrument identifier to trade. */
      instrumentId: number;
      /** Trade direction. */
      side: OrderSide;
      /** Limit price. */
      price: PerpsDecimalInput;
      /** Order quantity. */
      quantity: PerpsDecimalInput;
      /** Good-til-cancelled execution. */
      timeInForce: PerpsTimeInForce.GTC;
      /** Whether the order must rest instead of taking liquidity. */
      postOnly?: boolean;
      /** Whether the order may only reduce or close an existing position. */
      reduceOnly?: boolean;
      /** Optional caller-supplied idempotency identifier. Generated when omitted. */
      clientOrderId?: string;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
      /** Take-profit trigger to place with the entry order. */
      takeProfit: PerpsTpSlTrigger;
      /** Optional stop-loss trigger to place with the entry order. */
      stopLoss?: PerpsTpSlTrigger;
    }
  | {
      /** Perps instrument identifier to trade. */
      instrumentId: number;
      /** Trade direction. */
      side: OrderSide;
      /** Limit price. */
      price: PerpsDecimalInput;
      /** Order quantity. */
      quantity: PerpsDecimalInput;
      /** Good-til-cancelled execution. */
      timeInForce: PerpsTimeInForce.GTC;
      /** Whether the order must rest instead of taking liquidity. */
      postOnly?: boolean;
      /** Whether the order may only reduce or close an existing position. */
      reduceOnly?: boolean;
      /** Optional caller-supplied idempotency identifier. Generated when omitted. */
      clientOrderId?: string;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
      /** Optional take-profit trigger to place with the entry order. */
      takeProfit?: PerpsTpSlTrigger;
      /** Stop-loss trigger to place with the entry order. */
      stopLoss: PerpsTpSlTrigger;
    }
  | {
      /** Perps instrument identifier to trade. */
      instrumentId: number;
      /** Trade direction. */
      side: OrderSide;
      /** Optional limit price. Omit for market-style execution. */
      price?: PerpsDecimalInput;
      /** Order quantity. */
      quantity: PerpsDecimalInput;
      /** Immediate-or-cancel execution. */
      timeInForce: PerpsTimeInForce.IOC;
      postOnly?: never;
      /** Whether the order may only reduce or close an existing position. */
      reduceOnly?: boolean;
      /** Optional caller-supplied idempotency identifier. Generated when omitted. */
      clientOrderId?: string;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
      /** Take-profit trigger to place with the entry order. */
      takeProfit: PerpsTpSlTrigger;
      /** Optional stop-loss trigger to place with the entry order. */
      stopLoss?: PerpsTpSlTrigger;
    }
  | {
      /** Perps instrument identifier to trade. */
      instrumentId: number;
      /** Trade direction. */
      side: OrderSide;
      /** Optional limit price. Omit for market-style execution. */
      price?: PerpsDecimalInput;
      /** Order quantity. */
      quantity: PerpsDecimalInput;
      /** Immediate-or-cancel execution. */
      timeInForce: PerpsTimeInForce.IOC;
      postOnly?: never;
      /** Whether the order may only reduce or close an existing position. */
      reduceOnly?: boolean;
      /** Optional caller-supplied idempotency identifier. Generated when omitted. */
      clientOrderId?: string;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
      /** Optional take-profit trigger to place with the entry order. */
      takeProfit?: PerpsTpSlTrigger;
      /** Stop-loss trigger to place with the entry order. */
      stopLoss: PerpsTpSlTrigger;
    }
  | {
      /** Perps instrument identifier to trade. */
      instrumentId: number;
      /** Trade direction. */
      side: OrderSide;
      /** Optional limit price. Omit for market-style execution. */
      price?: PerpsDecimalInput;
      /** Order quantity. */
      quantity: PerpsDecimalInput;
      /** Fill-or-kill execution. */
      timeInForce: PerpsTimeInForce.FOK;
      postOnly?: never;
      /** Whether the order may only reduce or close an existing position. */
      reduceOnly?: boolean;
      /** Optional caller-supplied idempotency identifier. Generated when omitted. */
      clientOrderId?: string;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
      /** Take-profit trigger to place with the entry order. */
      takeProfit: PerpsTpSlTrigger;
      /** Optional stop-loss trigger to place with the entry order. */
      stopLoss?: PerpsTpSlTrigger;
    }
  | {
      /** Perps instrument identifier to trade. */
      instrumentId: number;
      /** Trade direction. */
      side: OrderSide;
      /** Optional limit price. Omit for market-style execution. */
      price?: PerpsDecimalInput;
      /** Order quantity. */
      quantity: PerpsDecimalInput;
      /** Fill-or-kill execution. */
      timeInForce: PerpsTimeInForce.FOK;
      postOnly?: never;
      /** Whether the order may only reduce or close an existing position. */
      reduceOnly?: boolean;
      /** Optional caller-supplied idempotency identifier. Generated when omitted. */
      clientOrderId?: string;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
      /** Optional take-profit trigger to place with the entry order. */
      takeProfit?: PerpsTpSlTrigger;
      /** Stop-loss trigger to place with the entry order. */
      stopLoss: PerpsTpSlTrigger;
    };

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PlacePerpsOrderRequestWithOptions =
  | PlacePerpsOrderRequest
  | PlacePerpsOrderWithTpSlRequest;

const PlacePerpsOrderRequestSchema = z.intersection(
  PerpsOrderRequestSchema,
  z.object({
    clientOrderId: PerpsClientOrderIdSchema.default(randomClientOrderId),
    expiresAt: z.number().int().positive().optional(),
    takeProfit: z.never().optional(),
    stopLoss: z.never().optional(),
  }),
) satisfies z.ZodType<PlacePerpsOrderRequest>;

const SuccessfulPerpsPostOrderAcksSchema = z
  .array(PerpsPostOrderAckSchema)
  .min(1)
  .refine(
    (acknowledgements) =>
      acknowledgements.every(
        (acknowledgement) => acknowledgement.status === 'ok',
      ),
    'Expected successful Perps order acknowledgements.',
  );

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPlacedTpSlOrder = {
  orderId: PerpsOrderId;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPlacedTpSlOrders = {
  takeProfit?: PerpsPlacedTpSlOrder;
  stopLoss?: PerpsPlacedTpSlOrder;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PlacePerpsOrderResult = {
  order: PerpsOrder;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PlacePerpsOrderWithTpSlResult = PlacePerpsOrderResult & {
  tpSl: PerpsPlacedTpSlOrders;
};

function hasPerpsTpSl(
  request: PlacePerpsOrderRequestWithOptions,
): request is PlacePerpsOrderWithTpSlRequest {
  return request.takeProfit !== undefined || request.stopLoss !== undefined;
}

/**
 * Places one Perps order and resolves with the first matching orders update.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function placePerpsOrder(
  client: PerpsEventCommandExecutor,
  request: PlacePerpsOrderWithTpSlRequest,
): Promise<PlacePerpsOrderWithTpSlResult>;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function placePerpsOrder(
  client: PerpsEventCommandExecutor,
  request: PlacePerpsOrderRequest,
): Promise<PlacePerpsOrderResult>;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function placePerpsOrder(
  client: PerpsEventCommandExecutor,
  request: PlacePerpsOrderRequestWithOptions,
): Promise<PlacePerpsOrderResult | PlacePerpsOrderWithTpSlResult>;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function placePerpsOrder(
  client: PerpsEventCommandExecutor,
  request: PlacePerpsOrderRequestWithOptions,
): Promise<PlacePerpsOrderResult | PlacePerpsOrderWithTpSlResult> {
  if (hasPerpsTpSl(request)) {
    return await placePerpsOrderWithTpSl(client, request);
  }

  const params = parseUserInput(request, PlacePerpsOrderRequestSchema);
  const [, update] = await client.executeCommandWithEvent(
    {
      op: ['createOrders', [toRawPerpsOrder(params)]],
      expiresAt: params.expiresAt,
    },
    SuccessfulPerpsPostOrderAcksSchema,
    isOrderUpdateFor(params.clientOrderId),
  );
  return { order: update.payload };
}

async function placePerpsOrderWithTpSl(
  client: PerpsEventCommandExecutor,
  request: PlacePerpsOrderWithTpSlRequest,
): Promise<PlacePerpsOrderWithTpSlResult> {
  const params = parseUserInput(request, PlacePerpsOrderWithTpSlRequestSchema);
  const orders: RawPerpsOrderInput[] = [toRawPerpsOrder(params)];
  const exitBuy = params.side === OrderSide.SELL;

  if (params.takeProfit !== undefined) {
    orders.push(
      toRawPerpsTpSlOrder({
        buy: exitBuy,
        instrumentId: params.instrumentId,
        kind: PerpsTpSlKind.TakeProfit,
        quantity: toDecimalString(params.quantity),
        trigger: params.takeProfit,
      }),
    );
  }
  if (params.stopLoss !== undefined) {
    orders.push(
      toRawPerpsTpSlOrder({
        buy: exitBuy,
        instrumentId: params.instrumentId,
        kind: PerpsTpSlKind.StopLoss,
        quantity: toDecimalString(params.quantity),
        trigger: params.stopLoss,
      }),
    );
  }

  const [acknowledgements, update] = await client.executeCommandWithEvent(
    {
      op: ['createOrders', orders, PerpsTpSlScope.Order],
      expiresAt: params.expiresAt,
    },
    SuccessfulPerpsPostOrderAcksSchema,
    isOrderUpdateFor(params.clientOrderId),
  );

  let triggerIndex = 1;
  const tpSl: PerpsPlacedTpSlOrders = {};
  if (params.takeProfit !== undefined) {
    tpSl.takeProfit = placedOrderFrom(
      expectPresent(
        acknowledgements[triggerIndex++],
        'Expected Perps take-profit acknowledgement.',
      ),
    );
  }
  if (params.stopLoss !== undefined) {
    tpSl.stopLoss = placedOrderFrom(
      expectPresent(
        acknowledgements[triggerIndex],
        'Expected Perps stop-loss acknowledgement.',
      ),
    );
  }

  return { order: update.payload, tpSl };
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PlacePerpsPositionTpSlRequest =
  | {
      /** Perps instrument identifier whose current position should receive TP/SL protection. */
      instrumentId: number;
      /** Take-profit trigger to place for the current position. */
      takeProfit: PerpsPositionTpSlTrigger;
      /** Optional stop-loss trigger to place alongside the take-profit. */
      stopLoss?: PerpsPositionTpSlTrigger;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
    }
  | {
      /** Perps instrument identifier whose current position should receive TP/SL protection. */
      instrumentId: number;
      /** Optional take-profit trigger to place alongside the stop-loss. */
      takeProfit?: PerpsPositionTpSlTrigger;
      /** Stop-loss trigger to place for the current position. */
      stopLoss: PerpsPositionTpSlTrigger;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
    };

const PerpsPositionTpSlRequiredPairSchema = z.union([
  z.object({
    takeProfit: PerpsPositionTpSlTriggerSchema,
    stopLoss: PerpsPositionTpSlTriggerSchema.optional(),
  }),
  z.object({
    takeProfit: PerpsPositionTpSlTriggerSchema.optional(),
    stopLoss: PerpsPositionTpSlTriggerSchema,
  }),
]);

const PlacePerpsPositionTpSlRequestSchema = z.intersection(
  PerpsPositionTpSlRequiredPairSchema,
  z.object({
    instrumentId: PerpsInstrumentIdSchema,
    expiresAt: z.number().int().positive().optional(),
  }),
) satisfies z.ZodType<PlacePerpsPositionTpSlRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PlacePerpsPositionTpSlResult = {
  tpSl: PerpsPlacedTpSlOrders;
};

type PerpsPortfolioReader = {
  fetchPortfolio(): Promise<PerpsPortfolio>;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function placePerpsPositionTpSl(
  client: PerpsCommandExecutor & PerpsPortfolioReader,
  request: PlacePerpsPositionTpSlRequest,
): Promise<PlacePerpsPositionTpSlResult> {
  const params = parseUserInput(request, PlacePerpsPositionTpSlRequestSchema);
  const buy = positionTpSlExitBuy(
    await client.fetchPortfolio(),
    params.instrumentId,
  );
  const orders: RawPerpsOrderInput[] = [];

  if (params.takeProfit !== undefined) {
    orders.push(
      toRawPerpsTpSlOrder({
        buy,
        instrumentId: params.instrumentId,
        kind: PerpsTpSlKind.TakeProfit,
        quantity: '0',
        trigger: params.takeProfit,
      }),
    );
  }
  if (params.stopLoss !== undefined) {
    orders.push(
      toRawPerpsTpSlOrder({
        buy,
        instrumentId: params.instrumentId,
        kind: PerpsTpSlKind.StopLoss,
        quantity: '0',
        trigger: params.stopLoss,
      }),
    );
  }

  const acknowledgements = await client.executeCommand(
    {
      op: ['createOrders', orders, PerpsTpSlScope.Position],
      expiresAt: params.expiresAt,
    },
    z.array(PerpsPostOrderAckSchema),
  );

  for (const acknowledgement of acknowledgements) {
    if (acknowledgement.status === 'err') {
      throw new RequestRejectedError(acknowledgement.error, { status: 200 });
    }
  }

  let triggerIndex = 0;
  const tpSl: PerpsPlacedTpSlOrders = {};
  if (params.takeProfit !== undefined) {
    tpSl.takeProfit = placedOrderFrom(
      expectPresent(
        acknowledgements[triggerIndex++],
        'Expected Perps take-profit acknowledgement.',
      ),
    );
  }
  if (params.stopLoss !== undefined) {
    tpSl.stopLoss = placedOrderFrom(
      expectPresent(
        acknowledgements[triggerIndex],
        'Expected Perps stop-loss acknowledgement.',
      ),
    );
  }

  return { tpSl };
}

const CancelPerpsOrderRequestSchema = z.union([
  z.object({
    orderId: PerpsOrderIdSchema,
    clientOrderId: z.undefined().optional(),
    expiresAt: z.number().int().positive().optional(),
  }),
  z.object({
    clientOrderId: PerpsClientOrderIdSchema,
    orderId: z.undefined().optional(),
    expiresAt: z.number().int().positive().optional(),
  }),
]) satisfies z.ZodType<CancelPerpsOrderRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type CancelPerpsOrderRequest =
  | {
      /** Order identifier to cancel. */
      orderId: number;
      clientOrderId?: never;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
    }
  | {
      /** Caller-supplied idempotency identifier to cancel. */
      clientOrderId: string;
      orderId?: never;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
    };

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function cancelPerpsOrder(
  client: PerpsCommandExecutor,
  request: CancelPerpsOrderRequest,
): Promise<PerpsCancelOrderResult> {
  const params = parseUserInput(request, CancelPerpsOrderRequestSchema);
  const [result] =
    params.orderId !== undefined
      ? await cancelPerpsOrders(client, {
          orderIds: [params.orderId],
          expiresAt: params.expiresAt,
        })
      : await cancelPerpsOrders(client, {
          clientOrderIds: [params.clientOrderId],
          expiresAt: params.expiresAt,
        });
  return expectPresent(result, 'Expected Perps cancel order result.');
}

const CancelPerpsOrdersRequestSchema = z.union([
  z.object({
    orderIds: z.array(PerpsOrderIdSchema).min(1),
    clientOrderIds: z.undefined().optional(),
    expiresAt: z.number().int().positive().optional(),
  }),
  z.object({
    clientOrderIds: z.array(PerpsClientOrderIdSchema).min(1),
    orderIds: z.undefined().optional(),
    expiresAt: z.number().int().positive().optional(),
  }),
]) satisfies z.ZodType<CancelPerpsOrdersRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type CancelPerpsOrdersRequest =
  | {
      /** Order identifiers to cancel. */
      orderIds: number[];
      clientOrderIds?: never;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
    }
  | {
      /** Caller-supplied idempotency identifiers to cancel. */
      clientOrderIds: string[];
      orderIds?: never;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
    };

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function cancelPerpsOrders(
  client: PerpsCommandExecutor,
  request: CancelPerpsOrdersRequest,
): Promise<PerpsCancelOrderResult[]> {
  const params = parseUserInput(request, CancelPerpsOrdersRequestSchema);
  if (params.orderIds !== undefined) {
    return await client.executeCommand(
      {
        op: ['cancelOrders', params.orderIds],
        expiresAt: params.expiresAt,
      },
      z.array(PerpsCancelOrderResultSchema),
    );
  }
  return await client.executeCommand(
    {
      op: ['cancelOrdersCOID', params.clientOrderIds],
      expiresAt: params.expiresAt,
    },
    z.array(PerpsCancelOrderResultSchema),
  );
}

const CancelAllPerpsOrdersRequestSchema = z
  .object({
    instrumentId: PerpsInstrumentIdSchema.optional(),
    expiresAt: z.number().int().positive().optional(),
  })
  .default({}) satisfies z.ZodType<CancelAllPerpsOrdersRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type CancelAllPerpsOrdersRequest = {
  /** Optional Perps instrument identifier to scope cancellation. */
  instrumentId?: number;
  /** Optional command expiration timestamp in milliseconds. */
  expiresAt?: number;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function cancelAllOrders(
  client: PerpsDeleteCommandExecutor,
  request?: CancelAllPerpsOrdersRequest,
): Promise<void> {
  const params = parseUserInput(request, CancelAllPerpsOrdersRequestSchema);
  const op = [
    'cancelAll',
    params.instrumentId === undefined ? [] : [params.instrumentId],
  ] as const satisfies PerpsSignedOp;
  await client.executeDeleteCommand({
    path: '/v1/trade/orders/all',
    op,
    responseSchema: PerpsCancelAllOrdersResponseSchema,
    expiresAt: params.expiresAt,
  });
}

const MINIMUM_AUTO_CANCEL_DELAY_MILLISECONDS = 5_000;

const ArmPerpsAutoCancelRequestSchema = z
  .object({
    cancelAt: z.number().int().positive(),
    expiresAt: z.number().int().positive().optional(),
  })
  .superRefine((params, context) => {
    const minimumCancelAt = Date.now() + MINIMUM_AUTO_CANCEL_DELAY_MILLISECONDS;

    if (params.cancelAt < minimumCancelAt) {
      context.addIssue({
        code: 'custom',
        message: 'cancelAt must be at least 5 seconds in the future.',
        path: ['cancelAt'],
      });
    }
  }) satisfies z.ZodType<ArmPerpsAutoCancelRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ArmPerpsAutoCancelRequest = {
  /**
   * Unix timestamp in milliseconds at which all open orders are cancelled.
   * Must be at least five seconds in the future.
   */
  cancelAt: number;
  /** Optional command expiration timestamp in milliseconds. */
  expiresAt?: number;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ArmPerpsAutoCancelError =
  | AutoCancelDailyLimitError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const ArmPerpsAutoCancelError = makeErrorGuard(
  AutoCancelDailyLimitError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

// Rejection identifier reported by the API when arming exceeds the daily
// trigger limit. The rejection message is the identifier followed by request
// context in parentheses.
const AUTO_CANCEL_DAILY_LIMIT_REACHED = 'auto_cancel_daily_limit_reached';

/**
 * Arms the one-shot auto-cancel switch that cancels all open Perps orders at
 * the requested time. Arming again replaces the previous schedule.
 *
 * @throws {@link ArmPerpsAutoCancelError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function armPerpsAutoCancel(
  client: ServiceClient,
  signCommand: SignPerpsRestCommand,
  request: ArmPerpsAutoCancelRequest,
): Promise<void> {
  const params = parseUserInput(request, ArmPerpsAutoCancelRequestSchema);
  const op = ['autoCancel', [params.cancelAt]] as const satisfies PerpsSignedOp;
  const command = signCommand(op, params.expiresAt);

  await unwrap(
    client
      .patch('/v1/trade/auto-cancel', {
        json: {
          ...command,
          op: toPerpsCommandBodyOp(op),
        },
      })
      .andThen(validateWith(PerpsAutoCancelResponseSchema))
      .mapErr((error) =>
        error instanceof RequestRejectedError &&
        error.message.startsWith(`${AUTO_CANCEL_DAILY_LIMIT_REACHED} (`)
          ? new AutoCancelDailyLimitError(
              'Auto-cancel daily trigger limit reached.',
              { cause: error },
            )
          : error,
      ),
  );
}

const DisarmPerpsAutoCancelRequestSchema = z
  .object({
    expiresAt: z.number().int().positive().optional(),
  })
  .default({}) satisfies z.ZodType<DisarmPerpsAutoCancelRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type DisarmPerpsAutoCancelRequest = {
  /** Optional command expiration timestamp in milliseconds. */
  expiresAt?: number;
};

/**
 * Disarms the auto-cancel schedule without triggering it. Disarming is
 * allowed even when the daily trigger limit has been reached.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function disarmPerpsAutoCancel(
  client: ServiceClient,
  signCommand: SignPerpsRestCommand,
  request?: DisarmPerpsAutoCancelRequest,
): Promise<void> {
  const params = parseUserInput(request, DisarmPerpsAutoCancelRequestSchema);
  const op = ['autoCancel', [0]] as const satisfies PerpsSignedOp;
  const command = signCommand(op, params.expiresAt);

  await unwrap(
    client
      .patch('/v1/trade/auto-cancel', {
        json: {
          ...command,
          op: toPerpsCommandBodyOp(op),
        },
      })
      .andThen(validateWith(PerpsAutoCancelResponseSchema)),
  );
}

const UpdatePerpsLeverageRequestSchema = z.object({
  instrumentId: PerpsInstrumentIdSchema,
  leverage: z.number().int().positive(),
  crossMargin: z.boolean(),
}) satisfies z.ZodType<UpdatePerpsLeverageRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type UpdatePerpsLeverageRequest = {
  /** Perps instrument identifier whose leverage should be updated. */
  instrumentId: number;
  /** Target leverage multiplier. */
  leverage: number;
  /** Whether the instrument should use cross margin. */
  crossMargin: boolean;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type UpdatePerpsLeverageError =
  | RequestRejectedError
  | SigningError
  | TransportError
  | UserInputError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const UpdatePerpsLeverageError = makeErrorGuard(
  RequestRejectedError,
  SigningError,
  TransportError,
  UserInputError,
);

/**
 * Updates Perps leverage and margin mode for an instrument.
 *
 * @throws {@link UpdatePerpsLeverageError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function updatePerpsLeverage(
  client: PerpsCommandExecutor,
  request: UpdatePerpsLeverageRequest,
): Promise<PerpsUpdateLeverageResult> {
  const params = parseUserInput(request, UpdatePerpsLeverageRequestSchema);
  return await client.executeCommand(
    {
      op: [
        'updateLeverage',
        [params.instrumentId, params.leverage, params.crossMargin],
      ],
    },
    PerpsUpdateLeverageResultSchema,
  );
}

const UpdatePerpsMarginRequestSchema = z.object({
  instrumentId: PerpsInstrumentIdSchema,
  amount: PerpsDecimalInputSchema,
}) satisfies z.ZodType<UpdatePerpsMarginRequest>;

/**
 * Request parameters for adjusting isolated margin on a Perps position.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type UpdatePerpsMarginRequest = {
  /** Perps instrument identifier whose isolated margin should be adjusted. */
  instrumentId: number;
  /** Margin adjustment. Positive values add margin; negative values remove it. */
  amount: PerpsDecimalInput;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type UpdatePerpsMarginError =
  | RequestRejectedError
  | SigningError
  | TransportError
  | UserInputError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const UpdatePerpsMarginError = makeErrorGuard(
  RequestRejectedError,
  SigningError,
  TransportError,
  UserInputError,
);

/**
 * Adjusts isolated margin for an instrument position.
 *
 * @throws {@link UpdatePerpsMarginError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function updatePerpsMargin(
  client: PerpsCommandExecutor,
  request: UpdatePerpsMarginRequest,
): Promise<void> {
  const params = parseUserInput(request, UpdatePerpsMarginRequestSchema);
  const amount = toDecimalString(params.amount);
  const ack = await client.executeCommand(
    { op: ['updateMargin', [params.instrumentId, amount]] },
    PerpsCommandAckSchema,
  );
  if (ack.status === 'err') {
    throw new RequestRejectedError(ack.error, { status: 200 });
  }
}

function randomClientOrderId(): PerpsClientOrderId {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return PerpsClientOrderIdSchema.parse(
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''),
  );
}

function isOrderUpdateFor(clientOrderId: PerpsClientOrderId) {
  return (event: PerpsSessionEvent): event is PerpsOrderUpdateEvent =>
    event.type === 'order' && event.payload.clientOrderId === clientOrderId;
}

function placedOrderFrom(
  acknowledgement: PerpsPostOrderAck,
): PerpsPlacedTpSlOrder {
  if (acknowledgement.status === 'err') {
    throw new RequestRejectedError(acknowledgement.error, { status: 200 });
  }

  return { orderId: acknowledgement.orderId };
}

function positionTpSlExitBuy(
  portfolio: PerpsPortfolio,
  instrumentId: PerpsInstrumentId,
): boolean {
  const position = portfolio.positions.find(
    (item) => item.instrumentId === instrumentId,
  );
  const sign = position === undefined ? 0 : decimalSign(position.size);

  if (sign === 0) {
    throw new UserInputError(
      `No open Perps position for instrument ${instrumentId}.`,
    );
  }

  return sign < 0;
}

function decimalSign(value: string): -1 | 0 | 1 {
  const trimmed = value.trim();
  const digits = trimmed.replace(/^[+-]/, '').replace('.', '');
  if (/^0*$/.test(digits)) return 0;
  return trimmed.startsWith('-') ? -1 : 1;
}

type RawPerpsOrderInput = readonly [
  PerpsInstrumentId,
  boolean,
  string | undefined,
  string,
  PerpsTimeInForce | undefined,
  boolean,
  true | undefined,
  string | undefined,
  RawPerpsTpSlTriggerInput | undefined,
];

type RawPerpsTpSlTriggerInput = readonly [
  boolean | undefined,
  string,
  PerpsTpSlKind,
];

function toRawPerpsOrder(
  order: z.output<typeof PerpsOrderRequestSchema>,
): RawPerpsOrderInput {
  return [
    order.instrumentId,
    order.side === OrderSide.BUY,
    order.price === undefined ? undefined : toDecimalString(order.price),
    toDecimalString(order.quantity),
    order.timeInForce,
    order.postOnly ?? false,
    order.reduceOnly === true ? true : undefined,
    order.clientOrderId,
    undefined,
  ];
}

function toRawPerpsTpSlOrder(request: {
  buy: boolean;
  instrumentId: PerpsInstrumentId;
  kind: PerpsTpSlKind;
  quantity: string;
  trigger: z.output<typeof PerpsTpSlTriggerSchema>;
}): RawPerpsOrderInput {
  return [
    request.instrumentId,
    request.buy,
    request.trigger.limitPrice === undefined
      ? undefined
      : toDecimalString(request.trigger.limitPrice),
    request.quantity,
    undefined,
    false,
    true,
    undefined,
    [
      request.trigger.limitPrice === undefined ? true : undefined,
      toDecimalString(request.trigger.triggerPrice),
      request.kind,
    ],
  ];
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function toPerpsCommandBodyOp(op: PerpsSignedOp) {
  const [type, args, group] = op;
  switch (type) {
    case 'createOrders':
      return withOptionalGroup(
        {
          args: (args as RawPerpsOrderInput[]).map(toPerpsOrderBody),
          type,
        },
        group,
      );
    case 'cancelOrders':
    case 'cancelOrdersCOID':
      return { type, args };
    case 'autoCancel': {
      const [time] = args as readonly [number];
      return { type, args: { time } };
    }
    case 'cancelAll': {
      const [instrumentId] = args as readonly [PerpsInstrumentId | undefined];
      return {
        type,
        args: instrumentId === undefined ? {} : { iid: instrumentId },
      };
    }
    case 'updateLeverage': {
      const [instrumentId, leverage, crossMargin] = args as readonly [
        PerpsInstrumentId,
        number,
        boolean,
      ];
      return {
        type,
        args: {
          cross: crossMargin,
          iid: instrumentId,
          lev: leverage,
        },
      };
    }
    case 'updateMargin': {
      const [instrumentId, amount] = args as readonly [
        PerpsInstrumentId,
        string,
      ];
      return {
        type,
        args: {
          amt: amount,
          iid: instrumentId,
        },
      };
    }
    default:
      invariant(false, `Unsupported Perps command: ${String(type)}`);
  }
}

function toPerpsOrderBody(order: RawPerpsOrderInput) {
  const body: Record<string, unknown> = {
    iid: order[0],
    buy: order[1],
    po: order[5],
    qty: order[3],
  };
  if (order[4] !== undefined) body.tif = order[4];
  if (order[6]) body.ro = order[6];
  if (order[2] !== undefined) body.p = order[2];
  if (order[7] !== undefined) body.c = order[7];
  if (order[8] !== undefined) body.tr = toPerpsTpSlTriggerBody(order[8]);
  return body;
}

function toPerpsTpSlTriggerBody(trigger: RawPerpsTpSlTriggerInput) {
  const body: Record<string, unknown> = {
    tpsl: trigger[2],
    trp: trigger[1],
  };
  if (trigger[0] !== undefined) body.market = trigger[0];
  return body;
}

function withOptionalGroup(
  body: Record<string, unknown>,
  group: unknown,
): Record<string, unknown> {
  if (group !== undefined) body.grp = group;
  return body;
}
