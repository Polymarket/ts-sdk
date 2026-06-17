import { SignatureType } from '@polymarket/bindings/clob';
import { RfqExecutionStatus } from '@polymarket/bindings/rfq';
import { invariant } from '@polymarket/types';

export const RFQ_ID = 'rfq-1';
export const QUOTE_ID = 'quote-1';
export const QUOTE_SIZE_E6 = 1_000_000;
export const BUY_QUOTE_SIZE_E6 = 2_222_222;
export const TX_HASH =
  '0x1111111111111111111111111111111111111111111111111111111111111111';

const signerAddress = '0x1111111111111111111111111111111111111111';
const makerAddress = '0x2222222222222222222222222222222222222222';

export type OutboundFrame = {
  decision?: unknown;
  maker_address?: unknown;
  price_e6?: unknown;
  quote_id?: unknown;
  rfq_id?: unknown;
  signer_address?: unknown;
  size_e6?: unknown;
  signed_order?: unknown;
  type?: string;
};

export function recordOutboundFrame(
  data: unknown,
  frames: OutboundFrame[],
): OutboundFrame {
  const frame = JSON.parse(String(data)) as OutboundFrame;
  frames.push(frame);
  return frame;
}

export function quoteAmounts(frame: OutboundFrame) {
  invariant(typeof frame.price_e6 === 'string', 'Expected RFQ quote price.');
  invariant(typeof frame.size_e6 === 'string', 'Expected RFQ quote size.');

  return {
    priceE6: Number(frame.price_e6),
    sizeE6: Number(frame.size_e6),
  };
}

export function confirmationDecision(frame: OutboundFrame) {
  invariant(
    typeof frame.decision === 'string',
    'Expected RFQ confirmation decision.',
  );

  return frame.decision;
}

function authAckFrame() {
  return {
    address: signerAddress,
    role: 'maker',
    success: true,
    type: 'auth',
  };
}

export function authAckMessage() {
  return JSON.stringify(authAckFrame());
}

function quoteRequestFrame(options: { direction?: 'BUY' | 'SELL' } = {}) {
  const direction = options.direction ?? 'BUY';

  return {
    condition_id:
      '0x032def24bfb0c5c57fb236fac08b94236a000000000000000000000000000000',
    direction,
    leg_position_ids: ['1', '2'],
    no_position_id: '456',
    requestor_public_id: 'req-1',
    requested_size: {
      unit: direction === 'BUY' ? 'notional' : 'shares',
      value_e6: String(QUOTE_SIZE_E6),
    },
    rfq_id: RFQ_ID,
    side: 'YES',
    submission_deadline: 123,
    type: 'RFQ_REQUEST',
    yes_position_id: '123',
  };
}

export function quoteRequestMessage(
  options: { direction?: 'BUY' | 'SELL' } = {},
) {
  return JSON.stringify(quoteRequestFrame(options));
}

function quoteAckFrame() {
  return {
    quote_id: QUOTE_ID,
    rfq_id: RFQ_ID,
    type: 'ACK_RFQ_QUOTE',
  };
}

export function quoteAckMessage() {
  return JSON.stringify(quoteAckFrame());
}

function quoteCancelAckFrame(options: { quoteId?: string } = {}) {
  return {
    quote_id: options.quoteId ?? QUOTE_ID,
    rfq_id: RFQ_ID,
    type: 'ACK_RFQ_QUOTE_CANCEL',
  };
}

export function quoteCancelAckMessage(options: { quoteId?: string } = {}) {
  return JSON.stringify(quoteCancelAckFrame(options));
}

function confirmationRequestFrame(
  priceE6: number,
  fillSizeE6: number,
  options: { direction?: 'BUY' | 'SELL' } = {},
) {
  return {
    ...quoteRequestFrame(options),
    confirm_by: 456,
    fill_size_e6: String(fillSizeE6),
    maker_address: makerAddress,
    price_e6: String(priceE6),
    quote_id: QUOTE_ID,
    signature_type: SignatureType.EOA,
    signer_address: signerAddress,
    type: 'RFQ_CONFIRMATION_REQUEST',
  };
}

export function confirmationRequestMessage(
  priceE6: number,
  fillSizeE6: number,
  options: { direction?: 'BUY' | 'SELL' } = {},
) {
  return JSON.stringify(confirmationRequestFrame(priceE6, fillSizeE6, options));
}

function confirmationAckFrame(decision: string) {
  return {
    decision,
    quote_id: QUOTE_ID,
    rfq_id: RFQ_ID,
    type: 'ACK_RFQ_CONFIRMATION_RESPONSE',
  };
}

export function confirmationAckMessage(decision: string) {
  return JSON.stringify(confirmationAckFrame(decision));
}

export function malformedQuoteAckMessage() {
  return JSON.stringify({
    rfq_id: RFQ_ID,
    type: 'ACK_RFQ_QUOTE',
  });
}

export function unknownRfqMessage() {
  return JSON.stringify({
    payload: 'ignored',
    type: 'RFQ_FUTURE_MESSAGE',
  });
}

function executionUpdateFrame() {
  return {
    rfq_id: RFQ_ID,
    status: RfqExecutionStatus.Confirmed,
    tx_hash: TX_HASH,
    type: 'RFQ_EXECUTION_UPDATE',
  };
}

export function executionUpdateMessage() {
  return JSON.stringify(executionUpdateFrame());
}

function tradeFrame() {
  return {
    condition_id:
      '0x032def24bfb0c5c57fb236fac08b94236a000000000000000000000000000000',
    direction: 'BUY',
    executed_at: 1_780_854_786_039,
    leg_position_ids: ['1', '2'],
    price_e6: '125000',
    requestor_public_id: 'req-1',
    rfq_id: RFQ_ID,
    side: 'YES',
    size_e6: '800000',
    tx_hash: TX_HASH,
    type: 'RFQ_TRADE',
  };
}

export function tradeMessage() {
  return JSON.stringify(tradeFrame());
}

function rfqErrorFrame(options: {
  code: string;
  error: string;
  quoteId?: string;
  requestType: string;
  rfqId?: string;
}) {
  return {
    code: options.code,
    error: options.error,
    quote_id: options.quoteId,
    request_type: options.requestType,
    rfq_id: options.rfqId,
    type: 'RFQ_ERROR',
  };
}

export function rfqErrorMessage(options: {
  code: string;
  error: string;
  quoteId?: string;
  requestType: string;
  rfqId?: string;
}) {
  return JSON.stringify(rfqErrorFrame(options));
}
