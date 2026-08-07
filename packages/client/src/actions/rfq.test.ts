import { OrderSide } from '@polymarket/bindings';
import {
  ComboAcceptFailureReason,
  ComboQuoteUnavailableReason,
  RfqRejectionCode,
  RfqStatus,
} from '@polymarket/bindings/combos';
import { WalletType } from '@polymarket/bindings/gamma';
import {
  errAsync,
  expectEvmAddress,
  okAsync,
  type ResultAsync,
} from '@polymarket/types';
import { describe, expect, it, vi } from 'vitest';
import type { BaseSecureClient } from '../clients';
import { production } from '../environments';
import {
  RequestRejectedError,
  TimeoutError,
  TransportError,
  UserInputError,
} from '../errors';
import type { Signer } from '../types';
import {
  type AcceptComboQuoteParams,
  acceptComboQuote,
  fetchRfqStatus,
  type RequestComboQuoteParams,
  RfqRequestRejectedError,
  requestComboQuote,
  waitForComboFill,
} from './rfq';

const SIGNER = expectEvmAddress('0x1111111111111111111111111111111111111111');
const SIGNATURE = `0x${'11'.repeat(65)}`;
const BUILDER_CODE = `0x${'ab'.repeat(32)}`;
const TX_HASH = `0x${'cd'.repeat(32)}`;
const TAKER_ORDER_HASH = `0x${'ef'.repeat(32)}`;
const LEGS = ['123', '456'];

const quoteReadyWire = {
  rfq_id: 'rfq-1',
  status: 'AWAITING_REQUESTER_ACCEPTANCE',
  expires_at: 1_773_890_765_500,
  builder_code: BUILDER_CODE,
  request: {
    rfq_id: 'rfq-1',
    leg_position_ids: LEGS,
    condition_id: `0x03${'0'.repeat(60)}`,
    yes_position_id: '789',
    no_position_id: '790',
    direction: 'BUY',
    side: 'YES',
    created_at: 1_773_890_758_000,
  },
  quote: {
    quote_id: 'quote-1',
    blended_price_e6: '450000',
    maker_amount_e6: '966191',
    taker_amount_e6: '1932381',
    total_required_e6: '1000000',
  },
};

const acceptParams = {
  quoteId: 'quote-1',
  rfqId: 'rfq-1',
};

describe('requestComboQuote', () => {
  it('requests a BUY quote sized in collateral and maps the winning quote', async () => {
    const { client, gatewayPost } = createClient({
      postResults: [okAsync(jsonResponse(quoteReadyWire))],
    });

    const result = await requestComboQuote(client, {
      amount: 100,
      direction: OrderSide.BUY,
      legPositionIds: LEGS,
    });

    expect(gatewayPost).toHaveBeenCalledWith('/v1/builder/rfq/requests', {
      json: {
        direction: 'BUY',
        leg_position_ids: LEGS,
        maker_address: SIGNER,
        requested_size: { unit: 'notional', value_e6: '100000000' },
        side: 'YES',
        signature_type: 0,
        signer_address: SIGNER,
      },
      timeout: 30_000,
    });
    expect(result).toEqual({
      quote: {
        blendedPrice: '0.45',
        expiresAt: 1_773_890_765_500,
        makerAmount: '0.966191',
        quoteId: 'quote-1',
        takerAmount: '1.932381',
        totalRequired: '1',
      },
      rfqId: 'rfq-1',
    });
  });

  it('requests a SELL quote sized in outcome tokens', async () => {
    const { client, gatewayPost } = createClient({
      postResults: [okAsync(jsonResponse(quoteReadyWire))],
    });

    await requestComboQuote(client, {
      direction: OrderSide.SELL,
      legPositionIds: LEGS,
      size: '2.5',
    });

    expect(gatewayPost).toHaveBeenCalledWith(
      '/v1/builder/rfq/requests',
      expect.objectContaining({
        json: expect.objectContaining({
          direction: 'SELL',
          requested_size: { unit: 'shares', value_e6: '2500000' },
        }),
      }),
    );
  });

  it('returns a quote: null result when the request attracts no quotes', async () => {
    const { client } = createClient({
      postResults: [
        okAsync(
          jsonResponse({
            rfq_id: 'rfq-2',
            status: 'FAILED',
            builder_code: BUILDER_CODE,
            error: { code: 'NO_QUOTES', message: 'no quotes' },
          }),
        ),
      ],
    });

    await expect(
      requestComboQuote(client, {
        amount: 100,
        direction: OrderSide.BUY,
        legPositionIds: LEGS,
      }),
    ).resolves.toEqual({
      quote: null,
      reason: ComboQuoteUnavailableReason.NoQuotes,
      rfqId: 'rfq-2',
    });
  });

  it('rejects invalid input without sending a request', async () => {
    const { client, gatewayPost } = createClient();

    const invalidInputs: RequestComboQuoteParams[] = [
      { amount: 100, direction: OrderSide.BUY, legPositionIds: ['123'] },
      {
        amount: 100,
        direction: OrderSide.BUY,
        legPositionIds: ['123', '123'],
      },
      {
        amount: 100,
        direction: OrderSide.BUY,
        legPositionIds: ['01', '1'],
      },
      { amount: 100, direction: OrderSide.BUY, legPositionIds: ['123', '0x2'] },
      { amount: '0.0000001', direction: OrderSide.BUY, legPositionIds: LEGS },
      { amount: 0, direction: OrderSide.BUY, legPositionIds: LEGS },
      { direction: OrderSide.SELL, legPositionIds: LEGS, size: -1 },
    ];

    for (const input of invalidInputs) {
      await expect(requestComboQuote(client, input)).rejects.toBeInstanceOf(
        UserInputError,
      );
    }

    expect(gatewayPost).not.toHaveBeenCalled();
  });

  it('requires builder authorization before sending a request', async () => {
    const { client, gatewayPost } = createClient({ hasBuilderApiKey: false });

    await expect(
      requestComboQuote(client, {
        amount: 100,
        direction: OrderSide.BUY,
        legPositionIds: LEGS,
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('require a Builder API Key'),
      name: 'UserInputError',
    });
    expect(gatewayPost).not.toHaveBeenCalled();
  });

  it('classifies gateway rejections and preserves the original error', async () => {
    const rejection = new RequestRejectedError('contradictory legs', {
      code: 'CONTRADICTORY_LEGS',
      status: 400,
    });
    const { client } = createClient({ postResults: [errAsync(rejection)] });

    const error = await requestComboQuote(client, {
      amount: 100,
      direction: OrderSide.BUY,
      legPositionIds: LEGS,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RfqRequestRejectedError);
    expect(error).toMatchObject({
      cause: rejection,
      code: RfqRejectionCode.ContradictoryLegs,
      status: 400,
    });
  });

  it('classifies current transient gateway rejections without treating them as invalid input', async () => {
    const rejection = new RequestRejectedError('service unavailable', {
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
    });
    const { client } = createClient({ postResults: [errAsync(rejection)] });

    await expect(
      requestComboQuote(client, {
        amount: 100,
        direction: OrderSide.BUY,
        legPositionIds: LEGS,
      }),
    ).rejects.toMatchObject({
      cause: rejection,
      code: RfqRejectionCode.ServiceUnavailable,
      name: 'RfqRequestRejectedError',
      status: 503,
    });
  });

  it('preserves the original error when a final-state failure code is unknown', async () => {
    const { client } = createClient({
      postResults: [
        okAsync(
          jsonResponse({
            rfq_id: 'rfq-3',
            status: 'FAILED',
            builder_code: BUILDER_CODE,
            error: { code: 'SOMETHING_NEW', message: 'something new' },
          }),
        ),
      ],
    });

    await expect(
      requestComboQuote(client, {
        amount: 100,
        direction: OrderSide.BUY,
        legPositionIds: LEGS,
      }),
    ).rejects.toMatchObject({
      cause: { code: 'SOMETHING_NEW', message: 'something new' },
      code: RfqRejectionCode.InvalidRfq,
      name: 'RfqRequestRejectedError',
      status: 200,
    });
  });

  it('falls back to INVALID_RFQ for rejection codes unknown to this SDK version', async () => {
    const rejection = new RequestRejectedError('something new', {
      code: 'SOMETHING_NEW',
      status: 400,
    });
    const { client } = createClient({ postResults: [errAsync(rejection)] });

    await expect(
      requestComboQuote(client, {
        amount: 100,
        direction: OrderSide.BUY,
        legPositionIds: LEGS,
      }),
    ).rejects.toMatchObject({
      cause: rejection,
      code: RfqRejectionCode.InvalidRfq,
      name: 'RfqRequestRejectedError',
    });
  });
});

describe('acceptComboQuote', () => {
  it('signs and submits the acceptance order for the winning quote', async () => {
    const { client, gatewayPost, signTypedData } = createClient({
      postResults: [
        okAsync(jsonResponse(quoteReadyWire)),
        okAsync(
          jsonResponse({
            rfq_id: 'rfq-1',
            status: 'EXECUTING',
            taker_order_hash: TAKER_ORDER_HASH,
          }),
        ),
      ],
    });

    const params = await requestQuoteForAcceptance(client);
    const result = await acceptComboQuote(client, params);

    expect(signTypedData).toHaveBeenCalledTimes(1);
    expect(gatewayPost).toHaveBeenCalledTimes(2);
    expect(gatewayPost).toHaveBeenNthCalledWith(
      2,
      '/v1/builder/rfq/requests/rfq-1/accept',
      expect.objectContaining({
        json: expect.objectContaining({
          quote_id: 'quote-1',
          signed_order: expect.objectContaining({
            builder: BUILDER_CODE,
            maker: SIGNER,
            makerAmount: '966191',
            metadata: `0x${'0'.repeat(64)}`,
            side: 0,
            signatureType: 0,
            signature: SIGNATURE,
            signer: SIGNER,
            takerAmount: '1932381',
            tokenId: '789',
          }),
        }),
      }),
    );
    expect(result).toEqual({
      rfqId: 'rfq-1',
      status: 'executing',
      takerOrderHash: TAKER_ORDER_HASH,
    });
  });

  it('retries the acceptance once after a dropped connection', async () => {
    const { client, gatewayPost, signTypedData } = createClient({
      postResults: [
        okAsync(jsonResponse(quoteReadyWire)),
        errAsync(new TransportError('socket hang up')),
        okAsync(
          jsonResponse({
            rfq_id: 'rfq-1',
            status: 'EXECUTING',
            taker_order_hash: TAKER_ORDER_HASH,
          }),
        ),
      ],
    });

    const params = await requestQuoteForAcceptance(client);
    const result = await acceptComboQuote(client, params);

    expect(signTypedData).toHaveBeenCalledTimes(1);
    expect(gatewayPost).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      rfqId: 'rfq-1',
      status: 'executing',
      takerOrderHash: TAKER_ORDER_HASH,
    });
  });

  it('accepts a quote by its RFQ and quote identifiers', async () => {
    const { client } = createClient({
      postResults: [
        okAsync(jsonResponse(quoteReadyWire)),
        okAsync(
          jsonResponse({
            rfq_id: 'rfq-1',
            status: 'EXECUTING',
            taker_order_hash: TAKER_ORDER_HASH,
          }),
        ),
      ],
    });

    const result = await requestComboQuote(client, {
      amount: 100,
      direction: OrderSide.BUY,
      legPositionIds: LEGS,
    });

    if (result.quote === null) {
      expect.unreachable('Expected a winning quote');
    }

    await expect(
      acceptComboQuote(client, {
        quoteId: result.quote.quoteId,
        rfqId: result.rfqId,
      }),
    ).resolves.toMatchObject({ status: 'executing' });
  });

  it('rejects a quote that was not requested with the same client', async () => {
    const { client, gatewayPost, signTypedData } = createClient();

    await expect(acceptComboQuote(client, acceptParams)).rejects.toMatchObject({
      message: expect.stringContaining(
        'was requested with this client instance',
      ),
      name: 'UserInputError',
    });
    expect(signTypedData).not.toHaveBeenCalled();
    expect(gatewayPost).not.toHaveBeenCalled();
  });

  it('returns a failed result when the maker declines', async () => {
    const { client } = createClient({
      postResults: [
        okAsync(jsonResponse(quoteReadyWire)),
        okAsync(
          jsonResponse({
            rfq_id: 'rfq-1',
            status: 'FAILED',
            taker_order_hash: TAKER_ORDER_HASH,
            error: { code: 'MAKER_DECLINED', message: 'maker declined' },
          }),
        ),
      ],
    });

    const params = await requestQuoteForAcceptance(client);

    await expect(acceptComboQuote(client, params)).resolves.toEqual({
      error: { code: 'MAKER_DECLINED', message: 'maker declined' },
      reason: ComboAcceptFailureReason.MakerDeclined,
      rfqId: 'rfq-1',
      status: 'failed',
    });
  });

  it('returns a failed result when the acceptance window has expired', async () => {
    const { client } = createClient({
      postResults: [
        okAsync(jsonResponse(quoteReadyWire)),
        errAsync(
          new RequestRejectedError('expired rfq', {
            code: 'EXPIRED_RFQ',
            status: 409,
          }),
        ),
      ],
    });

    const params = await requestQuoteForAcceptance(client);

    await expect(acceptComboQuote(client, params)).resolves.toEqual({
      error: { code: 'EXPIRED_RFQ', message: 'expired rfq' },
      reason: ComboAcceptFailureReason.AcceptanceWindowExpired,
      rfqId: 'rfq-1',
      status: 'failed',
    });
  });

  it('polls the status endpoint when the outcome is still pending and keeps the accepted order hash', async () => {
    const { client, gatewayGet } = createClient({
      getResults: [
        okAsync(jsonResponse({ rfq_id: 'rfq-1', status: 'EXECUTING' })),
      ],
      postResults: [
        okAsync(jsonResponse(quoteReadyWire)),
        okAsync(
          jsonResponse({
            rfq_id: 'rfq-1',
            status: 'AWAITING_MAKER_CONFIRMATION',
            taker_order_hash: TAKER_ORDER_HASH,
          }),
        ),
      ],
    });

    const params = await requestQuoteForAcceptance(client);
    const result = await acceptComboQuote(client, params);

    expect(gatewayGet).toHaveBeenCalledWith('/v1/builder/rfq/requests/rfq-1');
    expect(result).toEqual({
      rfqId: 'rfq-1',
      status: 'executing',
      takerOrderHash: TAKER_ORDER_HASH,
    });
  }, 10_000);

  it('omits the taker order hash when a retry attached to an existing acceptance', async () => {
    const { client } = createClient({
      postResults: [
        okAsync(jsonResponse(quoteReadyWire)),
        okAsync(jsonResponse({ rfq_id: 'rfq-1', status: 'EXECUTING' })),
      ],
    });

    const params = await requestQuoteForAcceptance(client);

    await expect(acceptComboQuote(client, params)).resolves.toEqual({
      rfqId: 'rfq-1',
      status: 'executing',
    });
  });
});

describe('waitForComboFill', () => {
  it('polls until confirmed and normalizes CONFIRMED to FILLED', async () => {
    const { client, gatewayGet } = createClient({
      getResults: [
        okAsync(jsonResponse({ rfq_id: 'rfq-1', status: 'EXECUTING' })),
        okAsync(
          jsonResponse({
            rfq_id: 'rfq-1',
            status: 'MINED',
            tx_hash: TX_HASH,
          }),
        ),
        okAsync(
          jsonResponse({
            rfq_id: 'rfq-1',
            status: 'CONFIRMED',
            tx_hash: TX_HASH,
          }),
        ),
      ],
    });

    await expect(
      waitForComboFill(client, { pollingIntervalMs: 1, rfqId: 'rfq-1' }),
    ).resolves.toEqual({
      rfqId: 'rfq-1',
      status: RfqStatus.Filled,
      txHash: TX_HASH,
    });
    expect(gatewayGet).toHaveBeenCalledTimes(3);
  });

  it('returns terminal failures with the gateway error', async () => {
    const { client } = createClient({
      getResults: [
        okAsync(
          jsonResponse({
            rfq_id: 'rfq-1',
            status: 'FAILED',
            error: {
              code: 'TRADE_SUBMISSION_FAILED',
              message: 'trade submission failed',
            },
          }),
        ),
      ],
    });

    await expect(waitForComboFill(client, { rfqId: 'rfq-1' })).resolves.toEqual(
      {
        error: {
          code: 'TRADE_SUBMISSION_FAILED',
          message: 'trade submission failed',
        },
        rfqId: 'rfq-1',
        status: RfqStatus.Failed,
      },
    );
  });

  it('throws a TimeoutError when the RFQ stays non-terminal', async () => {
    const executing = () =>
      okAsync(jsonResponse({ rfq_id: 'rfq-1', status: 'EXECUTING' }));
    const { client } = createClient({
      getResults: Array.from({ length: 50 }, executing),
    });

    await expect(
      waitForComboFill(client, {
        pollingIntervalMs: 1,
        rfqId: 'rfq-1',
        timeoutMs: 10,
      }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe('fetchRfqStatus', () => {
  it('maps pre-acceptance rejections to RfqRequestRejectedError', async () => {
    const { client } = createClient({
      getResults: [
        errAsync(
          new RequestRejectedError('rfq not accepted', {
            code: 'REQUEST_FAILED',
            status: 409,
          }),
        ),
      ],
    });

    await expect(
      fetchRfqStatus(client, { rfqId: 'rfq-1' }),
    ).rejects.toMatchObject({
      code: RfqRejectionCode.RequestFailed,
      name: 'RfqRequestRejectedError',
      status: 409,
    });
  });
});

type GatewayResult = ResultAsync<
  Response,
  RequestRejectedError | TransportError
>;

type CreateClientOptions = {
  getResults?: GatewayResult[];
  hasBuilderApiKey?: boolean;
  postResults?: GatewayResult[];
};

function createClient(options: CreateClientOptions = {}) {
  const postQueue = [...(options.postResults ?? [])];
  const getQueue = [...(options.getResults ?? [])];

  const gatewayPost = vi.fn(() => {
    const next = postQueue.shift();
    if (next === undefined) throw new Error('Unexpected gateway POST');
    return next;
  });
  const gatewayGet = vi.fn(() => {
    const next = getQueue.shift();
    if (next === undefined) throw new Error('Unexpected gateway GET');
    return next;
  });
  const signTypedData = vi.fn(async () => SIGNATURE);

  const signer = {
    getAddress: async () => SIGNER,
    signMessage: vi.fn(),
    signTypedData,
    sendTransaction: vi.fn(),
  } as unknown as Signer;

  const client = {
    account: {
      signer: SIGNER,
      wallet: SIGNER,
      walletType: WalletType.EOA,
    },
    builderGateway: { get: gatewayGet, post: gatewayPost },
    environment: production,
    hasBuilderApiKey: options.hasBuilderApiKey ?? true,
    signer,
  } as unknown as BaseSecureClient;

  return { client, gatewayGet, gatewayPost, signTypedData };
}

async function requestQuoteForAcceptance(
  client: BaseSecureClient,
): Promise<AcceptComboQuoteParams> {
  const result = await requestComboQuote(client, {
    amount: 100,
    direction: OrderSide.BUY,
    legPositionIds: LEGS,
  });

  if (result.quote === null) {
    expect.unreachable('Expected a winning quote');
  }

  return { quoteId: result.quote.quoteId, rfqId: result.rfqId };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}
