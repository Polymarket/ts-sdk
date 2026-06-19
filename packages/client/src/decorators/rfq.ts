import { openRfqSession, type RfqSession } from '../actions';
import type { BaseSecureClient } from '../clients';

export type {
  RfqCancelQuoteAck,
  RfqCancelQuoteRejectedErrorOptions,
  RfqConfirmationAck,
  RfqConfirmationRequest,
  RfqConfirmationRequestEvent,
  RfqEvent,
  RfqExecutionUpdate,
  RfqId,
  RfqQuoteId,
  RfqQuoteReference,
  RfqQuoteRejectedErrorOptions,
  RfqQuoteRequest,
  RfqQuoteRequestEvent,
  RfqQuoteResponse,
  RfqQuoteSource,
  RfqRequestedSize,
  RfqRequestorPublicId,
  RfqSession,
  RfqTrade,
  RfqTradeEvent,
} from '../actions/rfq';
export {
  OpenRfqSessionError,
  RfqCancelQuoteError,
  RfqCancelQuoteRejectedError,
  RfqConfirmationDecision,
  RfqConfirmationError,
  RfqConfirmationRejectedError,
  RfqDirection,
  RfqErrorCode,
  RfqExecutionStatus,
  RfqQuoteError,
  RfqQuoteRejectedError,
  RfqRequestedSizeUnit,
  RfqSide,
} from '../actions/rfq';

export type SecureRfqActions = {
  /**
   * Opens an RFQ event session.
   *
   * @remarks
   * The returned async iterator is a stream, not a worker queue. Await inside the
   * loop to process RFQ events sequentially, or dispatch handlers without awaiting
   * them to fan out handling when quote windows are tight.
   *
   * @example
   * Quote the full requested size:
   * ```ts
   * const session = await client.openRfqSession();
   *
   * for await (const event of session) {
   *   switch (event.type) {
   *     case 'quote_request':
   *       await event.quote({ price: 0.45 });
   *       break;
   *
   *     case 'execution_update':
   *       // event.rfqId: RfqId
   *       // event.status: RfqExecutionStatus
   *       // event.txHash: TxHash | undefined
   *       break;
   *   }
   * }
   * ```
   *
   * @example
   * Quote a specific outcome-token size. `0.5` means half of one share, not
   * half of one 6-decimal base unit:
   * ```ts
   * const session = await client.openRfqSession();
   *
   * for await (const event of session) {
   *   switch (event.type) {
   *     case 'quote_request':
   *       await event.quote({ price: 0.45, size: 0.5 });
   *       break;
   *
   *     // …
   *   }
   * }
   * ```
   *
   * @example
   * Cancel a submitted quote using the live session:
   * ```ts
   * const session = await client.openRfqSession();
   *
   * for await (const event of session) {
   *   switch (event.type) {
   *     case 'quote_request': {
   *       const ref = await event.quote({ price: 0.45 });
   *
   *       if (shouldCancel(ref)) {
   *         await session.cancelQuote(ref);
   *       }
   *       break;
   *     }
   *
   *     // …
   *   }
   * }
   * ```
   * The cancellation ack means the backend processed the request; it does not
   * guarantee the quote was withdrawn from an already-selected RFQ.
   *
   * @example
   * Handle Last Look confirmation requests:
   * ```ts
   * const session = await client.openRfqSession();
   *
   * for await (const event of session) {
   *   switch (event.type) {
   *     case 'quote_request':
   *       await event.quote({ price: 0.45 });
   *       break;
   *
   *     case 'confirmation_request':
   *       await event.confirm();
   *       break;
   *
   *     // …
   *   }
   * }
   * ```
   * Any maker can quote permissionlessly. Last Look confirmation requests are
   * only sent to makers with Last Look enabled.
   *
   * @example
   * Choose collateral or inventory per request:
   * ```ts
   * const session = await client.openRfqSession();
   *
   * for await (const event of session) {
   *   switch (event.type) {
   *     case 'quote_request': {
   *       switch (event.direction) {
   *         case RfqDirection.Buy:
   *           await event.quote({
   *             price: 0.45,
   *             source: chooseSource(event.yesPositionId, event.requestedSize),
   *           });
   *           break;
   *
   *         case RfqDirection.Sell:
   *           await event.quote({
   *             price: 0.45,
   *             source: chooseSource(event.noPositionId, event.requestedSize),
   *           });
   *           break;
   *       }
   *       break;
   *     }
   *
   *     case 'confirmation_request':
   *       await event.confirm();
   *       break;
   *
   *     // …
   *   }
   * }
   *
   * function chooseSource(positionId: PositionId, requestedSize: RfqRequestedSize): RfqQuoteSource {
   *   return hasInventory(positionId, requestedSize) ? 'inventory' : 'collateral';
   * }
   * ```
   *
   * @throws {@link OpenRfqSessionError}
   * Thrown on failure.
   */
  openRfqSession(): Promise<RfqSession>;
};

export function rfqActions(client: BaseSecureClient): SecureRfqActions {
  return {
    openRfqSession() {
      return openRfqSession(client);
    },
  };
}
