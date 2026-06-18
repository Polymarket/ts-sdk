import {
  type RfqConfirmationAck as BindingRfqConfirmationAck,
  type RfqQuoteAck as BindingRfqQuoteAck,
  type RfqQuoteCancelAck as BindingRfqQuoteCancelAck,
  RfqConfirmationDecision,
  type RfqConfirmationRequest,
  type RfqExecutionUpdate,
  type RfqId,
  type RfqQuoteId,
  type RfqQuoteRequest,
  type RfqTrade,
} from '@polymarket/bindings/rfq';
import type {
  RfqCancelQuoteAck,
  RfqConfirmationAck,
  RfqConfirmationRequestEvent,
  RfqExecutionUpdateEvent,
  RfqQuoteReference,
  RfqQuoteRequestEvent,
  RfqQuoteResponse,
  RfqTradeEvent,
} from '../../actions/rfq';

export interface RfqEventController {
  quote(
    request: RfqQuoteRequest,
    response: RfqQuoteResponse,
  ): Promise<RfqQuoteReference>;
  respondToConfirmation(
    rfqId: RfqId,
    quoteId: RfqQuoteId,
    decision: RfqConfirmationDecision,
  ): Promise<RfqConfirmationAck>;
}

export function toQuoteRequestEvent(
  controller: RfqEventController,
  message: RfqQuoteRequest,
): RfqQuoteRequestEvent {
  return {
    ...message,
    quote: (request) => controller.quote(message, request),
  };
}

export function toConfirmationRequestEvent(
  controller: RfqEventController,
  message: RfqConfirmationRequest,
): RfqConfirmationRequestEvent {
  const rfqId = message.rfqId;
  const quoteId = message.quoteId;
  return {
    ...message,
    confirm: () =>
      controller.respondToConfirmation(
        rfqId,
        quoteId,
        RfqConfirmationDecision.Confirm,
      ),
    decline: () =>
      controller.respondToConfirmation(
        rfqId,
        quoteId,
        RfqConfirmationDecision.Decline,
      ),
  };
}

export function toExecutionUpdateEvent(
  message: RfqExecutionUpdate,
): RfqExecutionUpdateEvent {
  return message;
}

export function toTradeEvent(message: RfqTrade): RfqTradeEvent {
  return message;
}

export function toQuoteAck(message: BindingRfqQuoteAck): RfqQuoteReference {
  return {
    quoteId: message.quoteId,
    rfqId: message.rfqId,
  };
}

export function toQuoteCancelAck(
  message: BindingRfqQuoteCancelAck,
): RfqCancelQuoteAck {
  return {
    quoteId: message.quoteId,
    rfqId: message.rfqId,
  };
}

export function toConfirmationAck(
  message: BindingRfqConfirmationAck,
): RfqConfirmationAck {
  return {
    quoteId: message.quoteId,
    rfqId: message.rfqId,
  };
}
