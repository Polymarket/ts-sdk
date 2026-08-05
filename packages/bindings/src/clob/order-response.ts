import { never, type TxHash } from '@polymarket/types';
import { z } from 'zod';
import {
  type DecimalString,
  DecimalStringSchema,
  type OrderId,
  OrderIdSchema,
  TxHashSchema,
} from '../shared';

// The API serializes unset decimal fields as empty strings, e.g. the
// making/taking amounts on an order that rests on the book without matching.
// Normalize to '0' so consumers never see '' as a DecimalString.
const OrderResponseAmountSchema = z.preprocess(
  (value) => (value === '' ? '0' : value),
  DecimalStringSchema,
);

const OrderResponsePayloadSchema = z.object({
  errorMsg: z.string(),
  makingAmount: OrderResponseAmountSchema,
  orderID: z.string(),
  status: z.string(),
  success: z.boolean(),
  takingAmount: OrderResponseAmountSchema,
  tradeIDs: z.array(z.string()).default([]),
  transactionsHashes: z.array(z.string()).default([]),
});

type OrderResponsePayload = z.infer<typeof OrderResponsePayloadSchema>;

/**
 * Placement outcome of an accepted order.
 */
export enum OrderPostStatus {
  /** The order rests on the book without matching. */
  LIVE = 'live',
  /** The order matched, fully or partially, at placement. */
  MATCHED = 'matched',
  /** The market imposes a matching delay; the order is queued. */
  DELAYED = 'delayed',
}

export const OrderPostStatusSchema = z.nativeEnum(OrderPostStatus);

export enum OrderResponseErrorCode {
  UNMATCHED = 'unmatched',
  MARKET_NOT_READY = 'market_not_ready',
  INSUFFICIENT_BALANCE_OR_ALLOWANCE = 'insufficient_balance_or_allowance',
  INVALID_NONCE = 'invalid_nonce',
  INVALID_EXPIRATION = 'invalid_expiration',
  POST_ONLY_WOULD_CROSS = 'post_only_would_cross',
  FOK_NOT_FILLED = 'fok_not_filled',
  FAK_NOT_FILLED = 'fak_not_filled',
  UNKNOWN = 'unknown',
}

export const OrderResponseErrorCodeSchema = z.nativeEnum(
  OrderResponseErrorCode,
);

/**
 * A successfully placed order.
 */
export type AcceptedOrderResponse = {
  ok: true;
  /** Unique identifier of the placed order. */
  orderId: OrderId;
  /** Placement outcome. Fills only exist when the status is `matched`. */
  status: OrderPostStatus;
  /** Amount of the maker asset committed by fills at placement. `'0'` when the order did not match. */
  makingAmount: DecimalString;
  /** Amount of the taker asset received by fills at placement. `'0'` when the order did not match. */
  takingAmount: DecimalString;
  /**
   * Settlement transaction hashes for fills that occurred at placement.
   * Populated on a best-effort basis: settlement happens asynchronously, so
   * this can be empty even when the order matched. Follow the order's trades
   * to obtain hashes reliably.
   */
  transactionsHashes: TxHash[];
  /**
   * Identifiers of the trades created by fills at placement. Empty when the
   * order did not match. Later fills of a resting order create new trades
   * that are not listed here.
   */
  tradeIds: string[];
};

/**
 * An order the venue refused to place.
 */
export type RejectedOrderResponse = {
  ok: false;
  /** Machine-readable rejection reason. */
  code: OrderResponseErrorCode;
  /** Human-readable rejection message. */
  message: string;
};

/**
 * Result of posting an order, discriminated on `ok`.
 */
export type OrderResponse = AcceptedOrderResponse | RejectedOrderResponse;

/**
 * Results of posting a batch of orders, in request order.
 */
export type OrderResponses = OrderResponse[];

export const AcceptedOrderResponseSchema = z.object({
  ok: z.literal(true),
  orderId: OrderIdSchema.refine((orderId) => orderId.length > 0),
  status: OrderPostStatusSchema,
  makingAmount: DecimalStringSchema,
  takingAmount: DecimalStringSchema,
  tradeIds: z.array(z.string()),
  transactionsHashes: z.array(TxHashSchema),
});

export const RejectedOrderResponseSchema = z.object({
  ok: z.literal(false),
  code: OrderResponseErrorCodeSchema,
  message: z.string().min(1),
});

export const OrderResponseSchema = OrderResponsePayloadSchema.transform(
  normalizeOrderResponse,
);

export const OrderResponsesSchema = z.array(OrderResponseSchema);

function isAcceptedOrderResponse(response: OrderResponsePayload): boolean {
  return (
    response.success &&
    response.errorMsg === '' &&
    response.orderID !== '' &&
    isOrderPostStatus(response.status)
  );
}

function parseOrderPostStatus(status: string): OrderPostStatus {
  switch (status) {
    case OrderPostStatus.LIVE:
      return OrderPostStatus.LIVE;
    case OrderPostStatus.MATCHED:
      return OrderPostStatus.MATCHED;
    case OrderPostStatus.DELAYED:
      return OrderPostStatus.DELAYED;
    default:
      never(`Unexpected order post status: ${status}`);
  }
}

function normalizeOrderResponse(response: OrderResponsePayload): OrderResponse {
  if (isAcceptedOrderResponse(response)) {
    return AcceptedOrderResponseSchema.parse({
      makingAmount: response.makingAmount,
      ok: true,
      orderId: response.orderID,
      status: parseOrderPostStatus(response.status),
      takingAmount: response.takingAmount,
      tradeIds: response.tradeIDs,
      transactionsHashes: response.transactionsHashes,
    });
  }

  return RejectedOrderResponseSchema.parse({
    code: inferOrderResponseErrorCode(response),
    message: response.errorMsg || 'Unknown order failure',
    ok: false,
  });
}

function inferOrderResponseErrorCode(
  response: OrderResponsePayload,
): OrderResponseErrorCode {
  // This is a boundary heuristic over legacy mixed `success`/`status`/`errorMsg`
  // fields. It is intentionally temporary and should be removed once the API
  // exposes structured success and error variants directly.
  if (response.status === 'unmatched') {
    return OrderResponseErrorCode.UNMATCHED;
  }

  switch (response.errorMsg) {
    case 'the market is not yet ready to process new orders':
      return OrderResponseErrorCode.MARKET_NOT_READY;
    case 'invalid nonce':
      return OrderResponseErrorCode.INVALID_NONCE;
    case 'invalid expiration':
      return OrderResponseErrorCode.INVALID_EXPIRATION;
    case 'invalid post-only order: order crosses book':
      return OrderResponseErrorCode.POST_ONLY_WOULD_CROSS;
    case "order couldn't be fully filled. FOK orders are fully filled or killed.":
      return OrderResponseErrorCode.FOK_NOT_FILLED;
    case 'no orders found to match with FAK order. FAK orders are partially filled or killed if no match is found.':
      return OrderResponseErrorCode.FAK_NOT_FILLED;
  }

  // CLOB currently returns one legacy text bucket for both balance and
  // allowance failures, so expose a combined structured code here.
  if (response.errorMsg.includes('not enough balance / allowance')) {
    return OrderResponseErrorCode.INSUFFICIENT_BALANCE_OR_ALLOWANCE;
  }

  return OrderResponseErrorCode.UNKNOWN;
}

function isOrderPostStatus(status: string): status is OrderPostStatus {
  return (
    status === OrderPostStatus.LIVE ||
    status === OrderPostStatus.MATCHED ||
    status === OrderPostStatus.DELAYED
  );
}
