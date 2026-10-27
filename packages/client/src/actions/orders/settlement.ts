import type { TxHash } from '@polymarket/bindings';
import type { AcceptedOrderResponse } from '@polymarket/bindings/clob';
import { z } from 'zod';
import type { BaseSecureClient } from '../../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../../errors';
import { parseUserInput } from '../../input';
import { listAccountTrades } from '../account';
import { pollOrderFillSettlement } from './settlement-polling';

const DEFAULT_SETTLEMENT_TIMEOUT_MS = 30_000;

const WaitForOrderFillSettlementRequestFields = {
  timeoutMs: z.number().int().positive().optional(),
};

const WaitForOrderFillSettlementRequestSchema = z
  .object(WaitForOrderFillSettlementRequestFields)
  .default({});

export type WaitForOrderFillSettlementRequest = {
  /**
   * Maximum time to wait for the order's fills to settle, in milliseconds.
   * Defaults to 30000.
   */
  timeoutMs?: number;
};

export type WaitForOrderFillSettlementError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TimeoutError
  | TransactionFailedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const WaitForOrderFillSettlementError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Waits until every fill listed in an order response reaches a terminal
 * settlement outcome and returns the settlement transaction hashes.
 *
 * @remarks
 * Settlement covers the fills listed in this order response, identified by the
 * response's `tradeIds`. These are the fills that happened immediately when
 * the order was accepted. It does not wait for later fills of any remaining
 * quantity resting on the book; subscribe to the `user` channel to follow
 * those.
 *
 * Orders without fill identifiers resolve immediately to any transaction
 * hashes carried by the order response, or an empty array. In the rare case
 * where some fills fail execution, the settled fills' hashes are still
 * returned; the failed fills simply contribute no hash.
 *
 * @example
 * ```ts
 * const response = await client.placeMarketOrder({
 *   assetId: '0x0122…0000',
 *   amount: 10,
 *   side: OrderSide.BUY,
 * });
 *
 * if (response.ok) {
 *   const hashes = await waitForOrderFillSettlement(client, response);
 * }
 * ```
 *
 * @throws {@link WaitForOrderFillSettlementError}
 * Thrown on failure.
 */
export async function waitForOrderFillSettlement(
  client: BaseSecureClient,
  order: AcceptedOrderResponse,
  request?: WaitForOrderFillSettlementRequest,
): Promise<TxHash[]> {
  const { timeoutMs = DEFAULT_SETTLEMENT_TIMEOUT_MS } = parseUserInput(
    request,
    WaitForOrderFillSettlementRequestSchema,
  );

  return pollOrderFillSettlement(order, timeoutMs, async (id) => {
    const page = await listAccountTrades(client, { id }).firstPage();
    return page.items;
  });
}
