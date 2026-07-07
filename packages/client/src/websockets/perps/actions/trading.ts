import {
  OrderSide,
  OrderSideSchema,
  toDecimalString,
} from '@polymarket/bindings';
import {
  PerpsCancelAllOrdersResponseSchema,
  type PerpsCancelOrderResult,
  PerpsCancelOrderResultSchema,
  PerpsClientOrderIdSchema,
  type PerpsDecimalInput,
  PerpsDecimalInputSchema,
  type PerpsInstrumentId,
  PerpsInstrumentIdSchema,
  PerpsOrderIdSchema,
  type PerpsPostOrderAck,
  PerpsPostOrderAckSchema,
  PerpsTimeInForce,
  PerpsTpSlKind,
  PerpsTpSlScope,
  type PerpsUpdateLeverageResult,
  PerpsUpdateLeverageResultSchema,
} from '@polymarket/bindings/perps';
import { expectPresent, invariant, unwrap } from '@polymarket/types';
import { z } from 'zod';
import {
  makeErrorGuard,
  RequestRejectedError,
  SigningError,
  TransportError,
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
  clientOrderId: PerpsClientOrderIdSchema.optional(),
});

/**
 * Good-til-cancelled Perps order.
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

export type PerpsSignedWsCommandRequest<T> = {
  op: PerpsSignedOp;
  responseSchema: z.ZodType<T>;
  timeoutMessage: string;
  expiresAt?: number;
};

export type PerpsTradingTransport = {
  sendSignedWsCommand<T>(request: PerpsSignedWsCommandRequest<T>): Promise<T>;
};

export type SignPerpsRestCommand = (
  op: PerpsSignedOp,
  expiresAt?: number,
) => Record<string, unknown>;

/** Request parameters for posting one or more Perps orders. */
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

export async function postPerpsOrders(
  transport: PerpsTradingTransport,
  request: PostPerpsOrdersRequest,
): Promise<PerpsPostOrderAck[]> {
  const params = parseUserInput(request, PostPerpsOrdersRequestSchema);
  return await transport.sendSignedWsCommand({
    op: ['createOrders', params.orders.map(toRawPerpsOrder)],
    responseSchema: z.array(PerpsPostOrderAckSchema),
    timeoutMessage: 'Perps post order acknowledgement timed out.',
    expiresAt: params.expiresAt,
  });
}

const PlacePerpsOrderWithTpSlRequestSchema = z.intersection(
  PerpsOrderRequestSchema,
  z.intersection(
    PerpsTpSlPairSchema,
    z.object({
      expiresAt: z.number().int().positive().optional(),
    }),
  ),
) satisfies z.ZodType<PlacePerpsOrderWithTpSlRequest>;

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
      /** Optional caller-supplied idempotency identifier. */
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
      /** Optional caller-supplied idempotency identifier. */
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
      /** Optional caller-supplied idempotency identifier. */
      clientOrderId?: string;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
      takeProfit?: never;
      stopLoss?: never;
    };

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
      /** Optional caller-supplied idempotency identifier. */
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
      /** Optional caller-supplied idempotency identifier. */
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
      /** Optional caller-supplied idempotency identifier. */
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
      /** Optional caller-supplied idempotency identifier. */
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
      /** Optional caller-supplied idempotency identifier. */
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
      /** Optional caller-supplied idempotency identifier. */
      clientOrderId?: string;
      /** Optional command expiration timestamp in milliseconds. */
      expiresAt?: number;
      /** Optional take-profit trigger to place with the entry order. */
      takeProfit?: PerpsTpSlTrigger;
      /** Stop-loss trigger to place with the entry order. */
      stopLoss: PerpsTpSlTrigger;
    };

export type PlacePerpsOrderRequestWithOptions =
  | PlacePerpsOrderRequest
  | PlacePerpsOrderWithTpSlRequest;

export function hasPerpsTpSl(
  request: PlacePerpsOrderRequestWithOptions,
): request is PlacePerpsOrderWithTpSlRequest {
  return request.takeProfit !== undefined || request.stopLoss !== undefined;
}

export async function placePerpsOrderWithTpSl(
  transport: PerpsTradingTransport,
  request: PlacePerpsOrderWithTpSlRequest,
): Promise<PerpsPostOrderAck[]> {
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

  return await placePerpsOrderGroup(transport, {
    expiresAt: params.expiresAt,
    group: PerpsTpSlScope.Order,
    orders,
  });
}

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

const PlacePerpsPositionTpSlCommandRequestSchema = z.intersection(
  PlacePerpsPositionTpSlRequestSchema,
  z.object({ buy: z.boolean() }),
);

type PlacePerpsPositionTpSlCommandRequest = PlacePerpsPositionTpSlRequest & {
  buy: boolean;
};

export async function placePerpsPositionTpSl(
  transport: PerpsTradingTransport,
  request: PlacePerpsPositionTpSlCommandRequest,
): Promise<PerpsPostOrderAck[]> {
  const params = parseUserInput(
    request,
    PlacePerpsPositionTpSlCommandRequestSchema,
  );
  const orders: RawPerpsOrderInput[] = [];

  if (params.takeProfit !== undefined) {
    orders.push(
      toRawPerpsTpSlOrder({
        buy: params.buy,
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
        buy: params.buy,
        instrumentId: params.instrumentId,
        kind: PerpsTpSlKind.StopLoss,
        quantity: '0',
        trigger: params.stopLoss,
      }),
    );
  }

  return await placePerpsOrderGroup(transport, {
    expiresAt: params.expiresAt,
    group: PerpsTpSlScope.Position,
    orders,
  });
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

export async function cancelPerpsOrder(
  transport: PerpsTradingTransport,
  request: CancelPerpsOrderRequest,
): Promise<PerpsCancelOrderResult> {
  const params = parseUserInput(request, CancelPerpsOrderRequestSchema);
  const [result] =
    params.orderId !== undefined
      ? await cancelPerpsOrders(transport, {
          orderIds: [params.orderId],
          expiresAt: params.expiresAt,
        })
      : await cancelPerpsOrders(transport, {
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

export async function cancelPerpsOrders(
  transport: PerpsTradingTransport,
  request: CancelPerpsOrdersRequest,
): Promise<PerpsCancelOrderResult[]> {
  const params = parseUserInput(request, CancelPerpsOrdersRequestSchema);
  if (params.orderIds !== undefined) {
    return await transport.sendSignedWsCommand({
      op: ['cancelOrders', params.orderIds],
      responseSchema: z.array(PerpsCancelOrderResultSchema),
      timeoutMessage: 'Perps cancel order response timed out.',
      expiresAt: params.expiresAt,
    });
  }
  return await transport.sendSignedWsCommand({
    op: ['cancelOrdersCOID', params.clientOrderIds],
    responseSchema: z.array(PerpsCancelOrderResultSchema),
    timeoutMessage: 'Perps cancel order response timed out.',
    expiresAt: params.expiresAt,
  });
}

const CancelAllPerpsOrdersRequestSchema = z
  .object({
    instrumentId: PerpsInstrumentIdSchema.optional(),
    expiresAt: z.number().int().positive().optional(),
  })
  .default({}) satisfies z.ZodType<CancelAllPerpsOrdersRequest>;

export type CancelAllPerpsOrdersRequest = {
  /** Optional Perps instrument identifier to scope cancellation. */
  instrumentId?: number;
  /** Optional command expiration timestamp in milliseconds. */
  expiresAt?: number;
};

export async function cancelAllOrders(
  client: ServiceClient,
  signCommand: SignPerpsRestCommand,
  request?: CancelAllPerpsOrdersRequest,
): Promise<void> {
  const params = parseUserInput(request, CancelAllPerpsOrdersRequestSchema);
  const op = [
    'cancelAll',
    params.instrumentId === undefined ? [] : [params.instrumentId],
  ] as const satisfies PerpsSignedOp;
  const command = signCommand(op, params.expiresAt);

  await unwrap(
    client
      .del('/v1/trade/orders/all', {
        json: {
          ...command,
          op: toPerpsCommandBodyOp(op),
        },
      })
      .andThen(validateWith(PerpsCancelAllOrdersResponseSchema)),
  );
}

const UpdatePerpsLeverageRequestSchema = z.object({
  instrumentId: PerpsInstrumentIdSchema,
  leverage: z.number().int().positive(),
  crossMargin: z.boolean(),
}) satisfies z.ZodType<UpdatePerpsLeverageRequest>;

export type UpdatePerpsLeverageRequest = {
  /** Perps instrument identifier whose leverage should be updated. */
  instrumentId: number;
  /** Target leverage multiplier. */
  leverage: number;
  /** Whether the instrument should use cross margin. */
  crossMargin: boolean;
};

export type UpdatePerpsLeverageError =
  | RequestRejectedError
  | SigningError
  | TransportError
  | UserInputError;
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
 */
export async function updatePerpsLeverage(
  transport: PerpsTradingTransport,
  request: UpdatePerpsLeverageRequest,
): Promise<PerpsUpdateLeverageResult> {
  const params = parseUserInput(request, UpdatePerpsLeverageRequestSchema);
  return await transport.sendSignedWsCommand({
    op: [
      'updateLeverage',
      [params.instrumentId, params.leverage, params.crossMargin],
    ],
    responseSchema: PerpsUpdateLeverageResultSchema,
    timeoutMessage: 'Perps update leverage response timed out.',
  });
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
    undefined,
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

async function placePerpsOrderGroup(
  transport: PerpsTradingTransport,
  request: {
    orders: RawPerpsOrderInput[];
    group: PerpsTpSlScope;
    expiresAt?: number;
  },
): Promise<PerpsPostOrderAck[]> {
  return await transport.sendSignedWsCommand({
    op: ['createOrders', request.orders, request.group],
    responseSchema: z.array(PerpsPostOrderAckSchema),
    timeoutMessage: 'Perps place TP/SL order acknowledgement timed out.',
    expiresAt: request.expiresAt,
  });
}

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
