import { TradeStatus, type TxHash, TxHashSchema } from '@polymarket/bindings';
import { delay } from '@polymarket/types';
import { TimeoutError, TransactionFailedError } from '../../errors';

export type SettlementTrade = {
  id: string;
  status: string;
  transactionHash?: string;
};

export type OrderFillSnapshot = {
  orderId: string;
  tradeIds: readonly string[];
  transactionsHashes: readonly TxHash[];
};

const SETTLEMENT_POLL_INTERVAL_MS = 250;

// A trade is settled once execution reached a terminal outcome: its
// transaction is confirmed on-chain, or it failed and never will be.
// Earlier statuses are not terminal: a transaction hash observed before
// confirmation can still be replaced if the transaction is retried.
function isTradeSettled(trade: SettlementTrade): boolean {
  return (
    trade.status === TradeStatus.Confirmed ||
    trade.status === TradeStatus.Failed
  );
}

function isFailedTrade(trade: SettlementTrade): boolean {
  return trade.status === TradeStatus.Failed;
}

/** Tracks the fills accepted with an order until every fill confirms or fails. */
export async function pollOrderFillSettlement(
  order: OrderFillSnapshot,
  timeoutMs: number,
  readTrades: (id: string) => Promise<readonly SettlementTrade[]>,
): Promise<TxHash[]> {
  const tradeIds = [...new Set(order.tradeIds)];

  if (tradeIds.length === 0) {
    return [...order.transactionsHashes];
  }

  const settled = new Map<string, SettlementTrade>();
  const deadline = Date.now() + timeoutMs;

  while (settled.size < tradeIds.length) {
    const pending = tradeIds.filter((id) => !settled.has(id));
    const pages = await Promise.all(pending.map((id) => readTrades(id)));

    for (const page of pages) {
      for (const trade of page) {
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
