import type {
  RfqConfirmationAck as BindingRfqConfirmationAck,
  RfqQuoteAck as BindingRfqQuoteAck,
  RfqQuoteCancelAck as BindingRfqQuoteCancelAck,
  RfqConfirmationRequest,
  RfqErrorCode,
  RfqExecutionUpdate,
  RfqId,
  RfqQuoteId,
  RfqQuoteRequest,
  RfqRequestedSize,
  RfqRequestorPublicId,
  RfqSide,
  RfqTrade,
} from '@polymarket/bindings/rfq';
import { PolymarketError } from '@polymarket/types';
import type { BaseSecureClient } from '../clients';
import {
  makeErrorGuard,
  SigningError,
  TimeoutError,
  TransportError,
  UserInputError,
} from '../errors';

export {
  RfqConfirmationDecision,
  RfqDirection,
  RfqErrorCode,
  RfqExecutionStatus,
  RfqRequestedSizeUnit,
  RfqSide,
} from '@polymarket/bindings/rfq';
export type {
  RfqConfirmationRequest,
  RfqExecutionUpdate,
  RfqId,
  RfqQuoteId,
  RfqQuoteRequest,
  RfqRequestedSize,
  RfqRequestorPublicId,
  RfqTrade,
};

/**
 * Plain-data reference identifying a submitted RFQ quote.
 *
 * @remarks
 * This identifies the quote; it does not imply execution or guarantee that a
 * later cancellation request can withdraw it.
 */
export type RfqQuoteReference = Omit<BindingRfqQuoteAck, 'type'>;

/** Acknowledgement that a quote cancellation request was processed. */
export type RfqCancelQuoteAck = Omit<BindingRfqQuoteCancelAck, 'type'>;
export type RfqConfirmationAck = Omit<
  BindingRfqConfirmationAck,
  'decision' | 'type'
>;

export type RfqQuoteSource = 'collateral' | 'inventory';

export type RfqQuoteResponse = {
  /** Quote price in pUSD per outcome token, for example `0.45` or `"0.45"`. */
  price: number | string;

  /**
   * How the maker wants to fund the quote.
   *
   * @remarks
   * For a BUY request (BUY YES):
   * - `inventory` sells YES tokens from the maker's inventory at `price`.
   * - `collateral` buys NO tokens with collateral at `1 - price`.
   *
   * For a SELL request (SELL YES):
   * - `inventory` sells NO tokens from the maker's inventory at `1 - price`.
   * - `collateral` buys YES tokens with collateral at `price`.
   *
   * When omitted, the SDK uses `collateral`.
   *
   * @defaultValue `'collateral'`
   */
  source?: RfqQuoteSource;

  /**
   * Optional quote size in outcome tokens.
   *
   * This is the human-readable token amount: `1` means one full share, not one
   * 6-decimal base unit. When omitted, the quote uses the full RFQ request size.
   */
  size?: number | string;
};

export type RfqQuoteRejectedErrorOptions = {
  /** RFQ error code for the rejected quote. */
  code?: RfqErrorCode;
  /** RFQ identifier for the rejected quote. */
  rfqId: RfqId;
};

/**
 * Error thrown when the RFQ server rejects a quote response.
 */
export class RfqQuoteRejectedError extends PolymarketError {
  override name = 'RfqQuoteRejectedError' as const;

  readonly code: RfqErrorCode | undefined;
  readonly rfqId: RfqId;

  constructor(
    message: string,
    options: ErrorOptions & RfqQuoteRejectedErrorOptions,
  ) {
    super(message, options);
    this.code = options.code;
    this.rfqId = options.rfqId;
  }
}

export type RfqQuoteError =
  | RfqQuoteRejectedError
  | SigningError
  | TimeoutError
  | TransportError
  | UserInputError;
export const RfqQuoteError = makeErrorGuard(
  RfqQuoteRejectedError,
  SigningError,
  TimeoutError,
  TransportError,
  UserInputError,
);

export type RfqCancelQuoteRejectedErrorOptions = {
  /** RFQ error code for the rejected cancellation request. */
  code?: RfqErrorCode;
  /** RFQ identifier for the cancellation request. */
  rfqId: RfqId;
  /** Quote identifier for the cancellation request. */
  quoteId: RfqQuoteId;
};

/**
 * Error thrown when the RFQ server rejects a quote cancellation request.
 */
export class RfqCancelQuoteRejectedError extends PolymarketError {
  override name = 'RfqCancelQuoteRejectedError' as const;

  readonly code: RfqErrorCode | undefined;
  readonly rfqId: RfqId;
  readonly quoteId: RfqQuoteId;

  constructor(
    message: string,
    options: ErrorOptions & RfqCancelQuoteRejectedErrorOptions,
  ) {
    super(message, options);
    this.code = options.code;
    this.rfqId = options.rfqId;
    this.quoteId = options.quoteId;
  }
}

export type RfqCancelQuoteError =
  | RfqCancelQuoteRejectedError
  | TimeoutError
  | TransportError;
export const RfqCancelQuoteError = makeErrorGuard(
  RfqCancelQuoteRejectedError,
  TimeoutError,
  TransportError,
);

export type RfqConfirmationRejectedErrorOptions = {
  /** RFQ error code for the rejected confirmation decision. */
  code?: RfqErrorCode;
  /** RFQ identifier for the rejected confirmation decision. */
  rfqId: RfqId;
  /** Quote identifier for the rejected confirmation decision. */
  quoteId: RfqQuoteId;
};

/**
 * Error thrown when the RFQ server rejects a confirmation decision.
 */
export class RfqConfirmationRejectedError extends PolymarketError {
  override name = 'RfqConfirmationRejectedError' as const;

  readonly code: RfqErrorCode | undefined;
  readonly rfqId: RfqId;
  readonly quoteId: RfqQuoteId;

  constructor(
    message: string,
    options: ErrorOptions & RfqConfirmationRejectedErrorOptions,
  ) {
    super(message, options);
    this.code = options.code;
    this.rfqId = options.rfqId;
    this.quoteId = options.quoteId;
  }
}

export type RfqConfirmationError =
  | RfqConfirmationRejectedError
  | TimeoutError
  | TransportError;
export const RfqConfirmationError = makeErrorGuard(
  RfqConfirmationRejectedError,
  TimeoutError,
  TransportError,
);

/**
 * Server request asking the market maker to provide a quote for an RFQ.
 */
export interface RfqQuoteRequestEvent extends RfqQuoteRequest {
  /** Requested RFQ size and unit. Share values are human-readable outcome-token amounts. */
  requestedSize: RfqRequestedSize;

  /**
   * Requested RFQ position side.
   *
   * @remarks
   * The current RFQ system only supports YES-side requests, so this is always
   * {@link RfqSide.Yes}. Use {@link RfqQuoteRequestEvent.direction} to determine
   * whether the requester wants to buy or sell that YES-side position.
   */
  side: RfqSide.Yes;

  /**
   * Sends a quote response for this RFQ request.
   *
   * @remarks
   * If this resolves, the server accepted the quote and assigned `quoteId`.
   *
   * @throws {@link RfqQuoteError}
   * Thrown when validation fails, signing fails, the websocket fails, the quote
   * acknowledgement times out, or the server rejects the quote.
   */
  quote(response: RfqQuoteResponse): Promise<RfqQuoteReference>;
}

/**
 * Server request asking the market maker to confirm or decline a selected quote.
 */
export interface RfqConfirmationRequestEvent extends RfqConfirmationRequest {
  /**
   * Requested RFQ position side.
   *
   * @remarks
   * The current RFQ system only supports YES-side requests, so this is always
   * {@link RfqSide.Yes}. Use {@link RfqConfirmationRequestEvent.direction} to
   * determine whether the requester wants to buy or sell that YES-side position.
   */
  side: RfqSide.Yes;

  /**
   * Confirms that the maker wants to proceed with the selected quote.
   *
   * @remarks
   * If this resolves, the server accepted the confirmation decision.
   *
   * @throws {@link RfqConfirmationError}
   * Thrown when the websocket fails, the acknowledgement times out, or the
   * server rejects the confirmation decision.
   */
  confirm(): Promise<RfqConfirmationAck>;

  /**
   * Declines the selected quote during the confirmation window.
   *
   * @remarks
   * If this resolves, the server accepted the decline decision.
   *
   * @throws {@link RfqConfirmationError}
   * Thrown when the websocket fails, the acknowledgement times out, or the
   * server rejects the decline decision.
   */
  decline(): Promise<RfqConfirmationAck>;
}

/**
 * Execution status update for an RFQ after acceptance and handoff.
 */
export interface RfqExecutionUpdateEvent extends RfqExecutionUpdate {}

/**
 * Confirmed combo trade broadcast visible to all authenticated quoters.
 */
export interface RfqTradeEvent extends RfqTrade {}

/**
 * Event emitted by an RFQ session.
 */
export type RfqEvent =
  | RfqQuoteRequestEvent
  | RfqConfirmationRequestEvent
  | RfqExecutionUpdateEvent
  | RfqTradeEvent;

export interface RfqSession extends AsyncIterable<RfqEvent> {
  /**
   * Requests cancellation of a submitted RFQ quote.
   *
   * @remarks
   * The returned ack means the backend processed the cancellation request; it
   * does not guarantee the quote was withdrawn from an already-selected RFQ.
   *
   * @throws {@link RfqCancelQuoteError}
   * Thrown when the websocket fails, the acknowledgement times out, or the
   * server rejects the cancellation request.
   */
  cancelQuote(reference: RfqQuoteReference): Promise<RfqCancelQuoteAck>;

  /**
   * Closes the RFQ quoter stream.
   */
  close(): Promise<void>;
}

export type OpenRfqSessionError = TransportError;
export const OpenRfqSessionError = makeErrorGuard(TransportError);

/**
 * Opens an RFQ event session.
 *
 * @remarks
 * The returned async iterator is a stream, not a worker queue. Await inside the
 * loop to process RFQ events sequentially, or dispatch handlers without awaiting
 * them to fan out handling when quote windows are tight.
 *
 * @throws {@link OpenRfqSessionError}
 * Thrown on failure.
 */
export async function openRfqSession(
  client: BaseSecureClient,
): Promise<RfqSession> {
  return client.webSockets.rfqQuoter.connect();
}
