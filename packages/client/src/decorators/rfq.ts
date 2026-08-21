import type {
  AcceptComboQuoteParams,
  AcceptComboQuoteResult,
  CancelMakerQuoteParams,
  MakerConfirmationResult,
  MakerRfqSnapshot,
  RequestComboQuoteParams,
  RequestComboQuoteResult,
  RfqSession,
  SubmitMakerConfirmationParams,
  SubmitMakerQuoteParams,
  SubmitMakerQuoteResult,
  WaitForComboFillParams,
  WaitForComboFillResult,
} from '../actions';
import {
  acceptComboQuote,
  cancelMakerQuote,
  openRfqSession,
  requestComboQuote,
  submitMakerConfirmation,
  submitMakerQuote,
  waitForComboFill,
} from '../actions';
import type { BaseSecureClient } from '../clients';

export type {
  BuilderRfqError,
  ComboQuote,
  FetchRfqStatusParams,
  MakerConfirmationEntry,
  MakerExecutionHandoff,
  MakerFillAllocation,
  MakerFillBundle,
  MakerRfqRequest,
  RfqCancelQuoteAck,
  RfqCancelQuoteRejectedErrorOptions,
  RfqConfirmationAck,
  RfqConfirmationRequest,
  RfqConfirmationRequestEvent,
  RfqErrorCode,
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
  RfqRequestRejectedErrorOptions,
  RfqSession,
  RfqStatusResult,
  RfqTrade,
  RfqTradeEvent,
} from '../actions/rfq';
export {
  AcceptComboQuoteError,
  CancelMakerQuoteError,
  ComboAcceptFailureReason,
  ComboQuoteUnavailableReason,
  FetchRfqStatusError,
  MakerRfqStatus,
  OpenRfqSessionError,
  RequestComboQuoteError,
  RfqCancelQuoteError,
  RfqCancelQuoteRejectedError,
  RfqConfirmationDecision,
  RfqConfirmationError,
  RfqConfirmationRejectedError,
  RfqDirection,
  RfqExecutionStatus,
  RfqKnownErrorCode,
  RfqQuoteError,
  RfqQuoteRejectedError,
  RfqRejectionCode,
  RfqRequestedSizeUnit,
  RfqRequestRejectedError,
  RfqSide,
  RfqStatus,
  SubmitMakerConfirmationError,
  SubmitMakerQuoteError,
  WaitForComboFillError,
} from '../actions/rfq';
export type {
  AcceptComboQuoteParams,
  AcceptComboQuoteResult,
  CancelMakerQuoteParams,
  MakerConfirmationResult,
  MakerRfqSnapshot,
  RequestComboQuoteParams,
  RequestComboQuoteResult,
  SubmitMakerConfirmationParams,
  SubmitMakerQuoteParams,
  SubmitMakerQuoteResult,
  WaitForComboFillParams,
  WaitForComboFillResult,
};

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

  /**
   * Requests a quote for a combo of positions.
   *
   * @remarks
   * Resolves when the quote competition window closes. A request that
   * attracts no usable quotes is a normal outcome, returned as `quote: null`
   * with a reason rather than thrown.
   *
   * A winning quote is self-contained JSON data and may be persisted or
   * routed to another process before acceptance.
   *
   * Requires a Builder API Key in the client configuration, via
   * `builderApiKey(...)` or `remoteBuilderSigning(...)`.
   *
   * @throws {@link RequestComboQuoteError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const result = await client.requestComboQuote({
   *   legPositionIds: ['123', '456'],
   *   direction: OrderSide.BUY,
   *   amount: 100,
   * });
   *
   * if (result.quote !== null) {
   *   // result.quote.blendedPrice: DecimalString
   *   // result.quote.totalRequired: DecimalString
   *   // SELL quotes also carry result.quote.netReceive after fees.
   *   // result.quote.expiresAt: EpochMilliseconds
   * }
   * ```
   */
  requestComboQuote(
    params: RequestComboQuoteParams,
  ): Promise<RequestComboQuoteResult>;

  /**
   * Accepts a self-contained combo quote, signing the acceptance order for
   * the authenticated account.
   *
   * @remarks
   * Resolves at the maker last-look outcome. A maker declining or the
   * acceptance window expiring is a normal outcome, returned as
   * `status: 'failed'`. `status: 'executing'` means the trade was handed off
   * for onchain execution; follow it with `waitForComboFill`.
   *
   * A transport failure or unrecognized acceptance response is retried once
   * automatically; this is safe because an already-accepted RFQ reports its
   * current status instead of executing twice. After such a retry
   * `takerOrderHash` is absent because the retried order was not the one
   * recorded.
   *
   * The quote is JSON-serializable and may cross process boundaries before
   * acceptance. The accepting client must represent the same account and
   * builder identity used to request it.
   * Treat the quote as signing-sensitive data: preserve its integrity across
   * process boundaries and do not accept fields modified by an untrusted client.
   *
   * @throws {@link AcceptComboQuoteError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const result = await client.requestComboQuote({
   *   legPositionIds: ['123', '456'],
   *   direction: OrderSide.BUY,
   *   amount: 100,
   * });
   *
   * if (result.quote !== null) {
   *   const acceptance = await client.acceptComboQuote(result.quote);
   * }
   * ```
   */
  acceptComboQuote(
    params: AcceptComboQuoteParams,
  ): Promise<AcceptComboQuoteResult>;

  /**
   * Waits for an accepted RFQ to reach a terminal state.
   *
   * @remarks
   * Polls the RFQ status until it is filled (or confirmed onchain),
   * `FAILED`, `EXPIRED`, or `CANCELED`. Terminal failure is a normal outcome
   * and is returned, not thrown. A `TimeoutError` does not mean the trade
   * failed; resume with the `fetchRfqStatus` action from
   * `@polymarket/client/actions`.
   *
   * @throws {@link WaitForComboFillError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const fill = await client.waitForComboFill({ rfqId });
   *
   * if (fill.status === RfqStatus.Filled) {
   *   // fill.txHash: TxHash
   * }
   * ```
   */
  waitForComboFill(
    params: WaitForComboFillParams,
  ): Promise<WaitForComboFillResult>;

  /**
   * Submits a maker quote for an open RFQ over HTTP.
   *
   * @remarks
   * The request/response alternative to quoting through
   * {@link SecureRfqActions.openRfqSession | openRfqSession}. Quote
   * submission and cancellation work fully over HTTP, but last-look
   * confirmation requests are only delivered through the streaming session;
   * keep one open to observe them. There is no endpoint for listing resting
   * quotes; keep the returned `quoteId`, later calls key on it.
   *
   * @throws {@link SubmitMakerQuoteError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const { quoteId, snapshot } = await client.submitMakerQuote({
   *   rfqId: event.rfqId,
   *   direction: event.direction,
   *   yesPositionId: event.yesPositionId,
   *   noPositionId: event.noPositionId,
   *   requestedSize: event.requestedSize,
   *   price: 0.45,
   * });
   * ```
   */
  submitMakerQuote(
    params: SubmitMakerQuoteParams,
  ): Promise<SubmitMakerQuoteResult>;

  /**
   * Cancels a resting maker quote over HTTP.
   *
   * @remarks
   * Clean and idempotent while the RFQ is collecting quotes. Once last look
   * has started, cancellation is treated as a decline: it fails the entire
   * RFQ and counts toward the maker's decline limits.
   *
   * @throws {@link CancelMakerQuoteError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const snapshot = await client.cancelMakerQuote({ rfqId, quoteId });
   * ```
   */
  cancelMakerQuote(params: CancelMakerQuoteParams): Promise<MakerRfqSnapshot>;

  /**
   * Responds to a last-look confirmation request over HTTP.
   *
   * @remarks
   * Confirmation requests are delivered through the streaming session; this
   * is the response channel. The window is short, so respond immediately.
   * The final confirming maker receives the execution handoff instead of a
   * snapshot.
   *
   * @throws {@link SubmitMakerConfirmationError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const result = await client.submitMakerConfirmation({
   *   rfqId,
   *   quoteId,
   *   decision: RfqConfirmationDecision.Confirm,
   * });
   * ```
   */
  submitMakerConfirmation(
    params: SubmitMakerConfirmationParams,
  ): Promise<MakerConfirmationResult>;
};

export function rfqActions(client: BaseSecureClient): SecureRfqActions {
  return {
    openRfqSession() {
      return openRfqSession(client);
    },
    requestComboQuote(params: RequestComboQuoteParams) {
      return requestComboQuote(client, params);
    },
    acceptComboQuote(params: AcceptComboQuoteParams) {
      return acceptComboQuote(client, params);
    },
    waitForComboFill(params: WaitForComboFillParams) {
      return waitForComboFill(client, params);
    },
    submitMakerQuote(params: SubmitMakerQuoteParams) {
      return submitMakerQuote(client, params);
    },
    cancelMakerQuote(params: CancelMakerQuoteParams) {
      return cancelMakerQuote(client, params);
    },
    submitMakerConfirmation(params: SubmitMakerConfirmationParams) {
      return submitMakerConfirmation(client, params);
    },
  };
}
