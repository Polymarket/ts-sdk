import { TradeStatus, type TxHash, TxHashSchema } from '@polymarket/bindings';
import type {
  AcceptedOrderResponse,
  ClobTrade,
} from '@polymarket/bindings/clob';
import { delay } from '@polymarket/types';
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

const SETTLEMENT_POLL_INTERVAL_MS = 250;
const DEFAULT_SETTLEMENT_TIMEOUT_MS = 30_000;

const WaitForOrderSettlementRequestFields = {
  timeoutMs: z.number().int().positive().optional(),
};

const WaitForOrderSettlementRequestSchema = z
  .object(WaitForOrderSettlementRequestFields)
  .default({});

export type WaitForOrderSettlementRequest = {
  /**
   * Maximum time to wait for the order's fills to settle, in milliseconds.
   * Defaults to 30000.
   */
  timeoutMs?: number;
};

export type WaitForOrderSettlementError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TimeoutError
  | TransactionFailedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const WaitForOrderSettlementError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransactionFailedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

// A trade is settled once execution reached a terminal outcome: its
// transaction is confirmed on-chain, or it failed and never will be.
// Earlier statuses are not terminal: a transaction hash observed before
// confirmation can still be replaced if the transaction is retried.
function isTradeSettled(trade: ClobTrade): boolean {
  return (
    trade.status === TradeStatus.Confirmed ||
    trade.status === TradeStatus.Failed
  );
}

function isFailedTrade(trade: ClobTrade): boolean {
  return trade.status === TradeStatus.Failed;
}

/**
 * Waits until every fill of a placed order is confirmed on-chain and returns the
 * settlement transaction hashes.
 *
 * @remarks
 * Settlement covers the fills that occurred at placement, identified by the
 * response's `tradeIds`. It does not wait for future fills of an order
 * resting on the book; subscribe to the `user` channel to follow those.
 *
 * Orders without fill identifiers resolve immediately to any transaction
 * hashes carried by the order response, or an empty array. In the rare case
 * where some fills fail execution, the settled fills' hashes are still
 * returned; the failed fills simply contribute no hash.
 *
 * @example
 * ```ts
 * const response = await client.placeMarketOrder({
 *   amount: 10,
 *   side: OrderSide.BUY,
 *   tokenId: '123',
 * });
 *
 * if (response.ok) {
 *   const hashes = await waitForOrderSettlement(client, response);
 * }
 * ```
 *
 * @throws {@link WaitForOrderSettlementError}
 * Thrown on failure: a timeout while fills are still settling, or every fill
 * failing execution. The order placement itself is unaffected.
 */
export async function waitForOrderSettlement(
  client: BaseSecureClient,
  order: AcceptedOrderResponse,
  request?: WaitForOrderSettlementRequest,
): Promise<TxHash[]> {
  const { timeoutMs = DEFAULT_SETTLEMENT_TIMEOUT_MS } = parseUserInput(
    request,
    WaitForOrderSettlementRequestSchema,
  );

  const tradeIds = [...new Set(order.tradeIds)];

  if (tradeIds.length === 0) {
    return [...order.transactionsHashes];
  }

  const settled = new Map<string, ClobTrade>();
  const deadline = Date.now() + timeoutMs;

  while (settled.size < tradeIds.length) {
    const pending = tradeIds.filter((id) => !settled.has(id));
    const pages = await Promise.all(
      pending.map((id) => listAccountTrades(client, { id }).firstPage()),
    );

    for (const page of pages) {
      for (const trade of page.items) {
        if (tradeIds.includes(trade.id) && isTradeSettled(trade)) {
          settled.set(trade.id, trade);
        }
      }
    }

    if (settled.size === tradeIds.length) {
      break;
    }

    if (Date.now() >= deadline) {
      const unsettled = tradeIds.filter((id) => !settled.has(id));
      throw new TimeoutError(
        `Timed out waiting for trades to settle: ${unsettled.join(', ')}`,
      );
    }

    await delay(SETTLEMENT_POLL_INTERVAL_MS);
  }

  const trades = [...settled.values()];

  if (trades.every(isFailedTrade)) {
    throw new TransactionFailedError(
      `Every fill of order ${order.orderId} failed execution: ${tradeIds.join(', ')}`,
    );
  }

  return [
    ...new Set(
      trades
        .filter((trade) => !isFailedTrade(trade))
        .map((trade) => trade.transactionHash),
    ),
  ].map((hash) => TxHashSchema.parse(hash));
}
