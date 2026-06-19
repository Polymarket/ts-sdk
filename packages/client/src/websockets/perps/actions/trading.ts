import { toDecimalString } from '@polymarket/bindings';
import {
  type PerpsCancelOrderAck,
  PerpsClientOrderIdSchema,
  type PerpsCommandAck,
  PerpsCommandAckSchema,
  PerpsDecimalInputSchema,
  type PerpsInstrumentId,
  PerpsInstrumentIdSchema,
  type PerpsModifyOrderAck,
  type PerpsOrderId,
  PerpsOrderIdSchema,
  type PerpsPlaceOrderAck,
  type PerpsTimeInForce,
  PerpsTimeInForceSchema,
  RawPerpsCancelOrderAckSchema,
  RawPerpsModifyOrderAckSchema,
  RawPerpsPlaceOrderAckSchema,
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
import type { PerpsSignedOp } from '../signing';

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
  buy: z.boolean(),
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
  bodyOp: unknown;
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

export async function placePerpsOrder(
  transport: PerpsTradingTransport,
  request: PlacePerpsOrderRequest,
): Promise<PerpsPlaceOrderAck> {
  const [ack] = await placePerpsOrders(transport, { orders: [request] });
  return expectPresent(ack, 'Expected Perps place order acknowledgement.');
}

const PlacePerpsOrdersRequestSchema = z.object({
  orders: z.array(PerpsOrderInputSchema).min(1),
  expiresAt: z.number().int().positive().optional(),
});

export type PlacePerpsOrdersRequest = z.input<
  typeof PlacePerpsOrdersRequestSchema
>;

export async function placePerpsOrders(
  transport: PerpsTradingTransport,
  request: PlacePerpsOrdersRequest,
): Promise<PerpsPlaceOrderAck[]> {
  const params = parseUserInput(request, PlacePerpsOrdersRequestSchema);
  return await transport.sendSignedWsCommand({
    op: ['createOrders', params.orders.map(toRawPerpsOrder)],
    responseSchema: z.array(RawPerpsPlaceOrderAckSchema),
    timeoutMessage: 'Perps place order acknowledgement timed out.',
    expiresAt: params.expiresAt,
  });
}

const ModifyPerpsOrderRequestSchema = z.object({
  orderId: PerpsOrderIdSchema,
  order: PerpsOrderInputSchema,
  expiresAt: z.number().int().positive().optional(),
});

export type ModifyPerpsOrderRequest = z.input<
  typeof ModifyPerpsOrderRequestSchema
>;

export async function modifyPerpsOrder(
  transport: PerpsTradingTransport,
  request: ModifyPerpsOrderRequest,
): Promise<PerpsModifyOrderAck> {
  const params = parseUserInput(request, ModifyPerpsOrderRequestSchema);
  const [ack] = await modifyPerpsOrders(transport, {
    orders: [{ orderId: params.orderId, order: params.order }],
    expiresAt: params.expiresAt,
  });
  return expectPresent(ack, 'Expected Perps modify order acknowledgement.');
}

const ModifyPerpsOrdersRequestSchema = z.object({
  orders: z
    .array(
      z.object({
        orderId: PerpsOrderIdSchema,
        order: PerpsOrderInputSchema,
      }),
    )
    .min(1),
  expiresAt: z.number().int().positive().optional(),
});

export type ModifyPerpsOrdersRequest = z.input<
  typeof ModifyPerpsOrdersRequestSchema
>;

export async function modifyPerpsOrders(
  transport: PerpsTradingTransport,
  request: ModifyPerpsOrdersRequest,
): Promise<PerpsModifyOrderAck[]> {
  const params = parseUserInput(request, ModifyPerpsOrdersRequestSchema);
  return await transport.sendSignedWsCommand({
    op: [
      'modifyOrders',
      params.orders.map((order) => [
        order.orderId,
        toRawPerpsOrder(order.order),
      ]),
    ],
    responseSchema: z.array(RawPerpsModifyOrderAckSchema),
    timeoutMessage: 'Perps modify order acknowledgement timed out.',
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
): Promise<PerpsCancelOrderAck> {
  const params = parseUserInput(request, CancelPerpsOrderRequestSchema);
  const [ack] =
    params.orderId !== undefined
      ? await cancelPerpsOrders(transport, {
          orderIds: [params.orderId],
          expiresAt: params.expiresAt,
        })
      : await cancelPerpsOrders(transport, {
          clientOrderIds: [params.clientOrderId],
          expiresAt: params.expiresAt,
        });
  return expectPresent(ack, 'Expected Perps cancel order acknowledgement.');
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
): Promise<PerpsCancelOrderAck[]> {
  const params = parseUserInput(request, CancelPerpsOrdersRequestSchema);
  if (params.orderIds !== undefined) {
    return await transport.sendSignedWsCommand({
      op: ['cancelOrders', params.orderIds],
      responseSchema: z.array(RawPerpsCancelOrderAckSchema),
      timeoutMessage: 'Perps cancel order acknowledgement timed out.',
      expiresAt: params.expiresAt,
    });
  }
  return await transport.sendSignedWsCommand({
    op: ['cancelOrdersCOID', params.clientOrderIds],
    responseSchema: z.array(RawPerpsCancelOrderAckSchema),
    timeoutMessage: 'Perps cancel order acknowledgement timed out.',
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
      args: {
        amt: amount,
        iid: params.instrumentId,
      },
      type: 'updateMargin',
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
    order.buy,
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
        args: (args as RawPerpsOrderInput[]).map(toPerpsOrderBody),
        type,
      };
    case 'modifyOrders':
      return {
        args: (args as Array<readonly [PerpsOrderId, RawPerpsOrderInput]>).map(
          ([orderId, order]) => ({
            oid: orderId,
            order: toPerpsOrderBody(order),
          }),
        ),
        type,
      };
    case 'cancelOrders':
    case 'cancelOrdersCOID':
      return { args, type };
    case 'updateLeverage': {
      const [instrumentId, leverage, crossMargin] = args as readonly [
        PerpsInstrumentId,
        number,
        boolean,
      ];
      return {
        args: {
          cross: crossMargin,
          iid: instrumentId,
          lev: leverage,
        },
        type,
      };
    }
    default:
      invariant(false, `Unsupported Perps command: ${String(type)}`);
  }
}

function toPerpsOrderBody(order: RawPerpsOrderInput) {
  const body: Record<string, unknown> = {
    buy: order[1],
    iid: order[0],
    po: order[5],
    qty: order[3],
    tif: order[4],
  };
  if (order[2] !== undefined) body.p = order[2];
  if (order[6] !== undefined) body.c = order[6];
  return body;
}
