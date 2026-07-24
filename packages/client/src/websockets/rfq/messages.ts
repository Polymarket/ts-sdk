import type { ApiKeyCreds } from '@polymarket/bindings/clob';
import type {
  RfqAuthMessage,
  RfqConfirmationDecision,
  RfqConfirmationResponseMessage,
  RfqId,
  RfqQuoteCancelMessage,
  RfqQuoteId,
  RfqQuoteMessage,
  RfqQuoteRequest,
} from '@polymarket/bindings/combos';
import type { AccountIdentity } from '../../wallet';
import { resolveOrderIdentity } from '../../wallet';
import type { RfqQuote } from './quote';

export function createAuthMessage(
  account: AccountIdentity,
  credentials: ApiKeyCreds,
): RfqAuthMessage {
  const identity = resolveOrderIdentity(account);

  return {
    auth: {
      apiKey: credentials.key,
      passphrase: credentials.passphrase,
      secret: credentials.secret,
    },
    identity: {
      maker_address: identity.maker,
      signature_type: identity.signatureType,
      signer_address: identity.signer,
    },
    type: 'auth',
  };
}

export function createQuoteMessage(
  request: RfqQuoteRequest,
  quote: RfqQuote,
): RfqQuoteMessage {
  return {
    price_e6: quote.price.toString(),
    rfq_id: request.rfqId,
    signed_order: quote.signedOrder,
    size_e6: quote.size.toString(),
    type: 'RFQ_QUOTE',
  };
}

export function createQuoteCancelMessage(
  account: AccountIdentity,
  rfqId: RfqId,
  quoteId: RfqQuoteId,
): RfqQuoteCancelMessage {
  const identity = resolveOrderIdentity(account);

  return {
    maker_address: identity.maker,
    quote_id: quoteId,
    rfq_id: rfqId,
    signer_address: identity.signer,
    type: 'RFQ_QUOTE_CANCEL',
  };
}

export function createConfirmationResponseMessage(
  rfqId: RfqId,
  quoteId: RfqQuoteId,
  decision: RfqConfirmationDecision,
): RfqConfirmationResponseMessage {
  return {
    decision,
    quote_id: quoteId,
    rfq_id: rfqId,
    type: 'RFQ_CONFIRMATION_RESPONSE',
  };
}
