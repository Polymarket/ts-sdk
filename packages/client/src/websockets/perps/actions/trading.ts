import {
  OrderSide,
  OrderSideSchema,
  toDecimalString,
} from '@polymarket/bindings';
import {
  type PerpsCancelOrderResult,
  PerpsCancelOrderResultSchema,
  PerpsClientOrderIdSchema,
  type PerpsCommandAck,
  PerpsCommandAckSchema,
  PerpsDecimalInputSchema,
  type PerpsInstrumentId,
  PerpsInstrumentIdSchema,
  PerpsOrderIdSchema,
  type PerpsPostOrderAck,
  PerpsPostOrderAckSchema,
  type PerpsTimeInForce,
  PerpsTimeInForceSchema,
} from '@polymarket/bindings/perps';
import { expectPresent, invariant } from '@polymarket/types';
import { z } from 'zod';
import {
  makeErrorGuard,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../../../errors';
import { parseUserInput } from '../../../input';
import type { PerpsSignableValue, PerpsSignedOp } from '../signing';

type RawPerpsOrderInput = readonly [
  PerpsInstrumentId,
  boolean,
  string | undefined,
  string,
  PerpsTimeInForce,
  boolean,
  string | undefined,
];

const PerpsOrderInputSchema = z.object({
  instrumentId: PerpsInstrumentIdSchema,
  side: OrderSideSchema,
  price: PerpsDecimalInputSchema.optional(),
  quantity: PerpsDecimalInputSchema,
  timeInForce: PerpsTimeInForceSchema,
  postOnly: z.boolean().optional(),
  clientOrderId: PerpsClientOrderIdSchema.optional(),
});

export type PerpsSignedWsCommandRequest<T> = {
  op: PerpsSignedOp;
  responseSchema: z.ZodType<T>;
  timeoutMessage: string;
  expiresAt?: number;
};

export type PerpsSignedHttpCommandRequest = {
  bodyOp: PerpsSignableValue;
  op: PerpsSignedOp;
};

export type PerpsTradingTransport = {
  sendSignedWsCommand<T>(request: PerpsSignedWsCommandRequest<T>): Promise<T>;
  sendSignedHttpCommand(
    path: string,
    request: PerpsSignedHttpCommandRequest,
  ): Promise<PerpsCommandAck>;
};

const PlacePerpsOrderRequestSchema = PerpsOrderInputSchema;

export type PlacePerpsOrderRequest = z.input<
  typeof PlacePerpsOrderRequestSchema
>;

const PostPerpsOrdersRequestSchema = z.object({
  orders: z.array(PerpsOrderInputSchema).min(1),
  expiresAt: z.number().int().positive().optional(),
});

export type PostPerpsOrdersRequest = z.input<
  typeof PostPerpsOrdersRequestSchema
>;

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
]);

export type CancelPerpsOrderRequest = z.input<
  typeof CancelPerpsOrderRequestSchema
>;

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
]);

export type CancelPerpsOrdersRequest = z.input<
  typeof CancelPerpsOrdersRequestSchema
>;

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

const UpdatePerpsLeverageRequestSchema = z.object({
  instrumentId: PerpsInstrumentIdSchema,
  leverage: z.number().int().positive(),
  crossMargin: z.boolean(),
});

export type UpdatePerpsLeverageRequest = z.input<
  typeof UpdatePerpsLeverageRequestSchema
>;

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
): Promise<void> {
  const params = parseUserInput(request, UpdatePerpsLeverageRequestSchema);
  const ack = await transport.sendSignedWsCommand({
    op: [
      'updateLeverage',
      [params.instrumentId, params.leverage, params.crossMargin],
    ],
    responseSchema: PerpsCommandAckSchema,
    timeoutMessage: 'Perps update leverage acknowledgement timed out.',
  });
  if (ack.status === 'err') {
    throw new RequestRejectedError(
      ack.error ?? 'Perps update leverage command was rejected.',
      { status: 200 },
    );
  }
}

const UpdatePerpsMarginRequestSchema = z.object({
  instrumentId: PerpsInstrumentIdSchema,
  amount: PerpsDecimalInputSchema,
});

export type UpdatePerpsMarginRequest = z.input<
  typeof UpdatePerpsMarginRequestSchema
>;

export type UpdatePerpsMarginError =
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const UpdatePerpsMarginError = makeErrorGuard(
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Updates isolated margin for an instrument position.
 *
 * @throws {@link UpdatePerpsMarginError}
 * Thrown on failure.
 */
export async function updatePerpsMargin(
  transport: PerpsTradingTransport,
  request: UpdatePerpsMarginRequest,
): Promise<void> {
  const params = parseUserInput(request, UpdatePerpsMarginRequestSchema);
  const amount = toDecimalString(params.amount);
  const ack = await transport.sendSignedHttpCommand('/v1/trade/margin', {
    op: ['updateMargin', [params.instrumentId, amount]],
    bodyOp: {
      type: 'updateMargin',
      args: {
        amt: amount,
        iid: params.instrumentId,
      },
    },
  });
  if (ack.status === 'err') {
    throw new RequestRejectedError(
      ack.error ?? 'Perps update margin command was rejected.',
      { status: 200 },
    );
  }
}

function toRawPerpsOrder(
  order: z.output<typeof PerpsOrderInputSchema>,
): RawPerpsOrderInput {
  return [
    order.instrumentId,
    order.side === OrderSide.BUY,
    order.price === undefined ? undefined : toDecimalString(order.price),
    toDecimalString(order.quantity),
    order.timeInForce,
    order.postOnly ?? false,
    order.clientOrderId,
  ];
}

export function toPerpsCommandBodyOp(op: PerpsSignedOp) {
  const [type, args] = op;
  switch (type) {
    case 'createOrders':
      return {
        type,
        args: (args as RawPerpsOrderInput[]).map(toPerpsOrderBody),
      };
    case 'cancelOrders':
    case 'cancelOrdersCOID':
      return { type, args };
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
  };
  if (order[2] !== undefined) body.p = order[2];
  body.qty = order[3];
  if (order[4] !== undefined) body.tif = order[4];
  body.po = order[5];
  if (order[6] !== undefined) body.c = order[6];
  return body;
}
