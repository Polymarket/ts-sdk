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
  acceptComboQuote,
  type ComboQuote,
  type RequestComboQuoteParams,
  RfqRequestRejectedError,
  requestComboQuote,
  waitForComboFill,
} from './rfq';

const SIGNER = expectEvmAddress('0x1111111111111111111111111111111111111111');
const SIGNATURE = `0x${'11'.repeat(65)}`;
const BUILDER_CODE = `0x${'ab'.repeat(32)}`;
const TAKER_ORDER_HASH = `0x${'ef'.repeat(32)}`;
const LEGS = ['123', '456'];

const buyRequest: RequestComboQuoteParams = {
  amount: 100,
  direction: OrderSide.BUY,
  legPositionIds: LEGS,
};

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

const comboQuote = {
  blendedPrice: '0.45',
  builderCode: BUILDER_CODE,
  direction: OrderSide.BUY,
  expiresAt: 1_773_890_765_500,
  makerAmount: '0.966191',
  positionId: '789',
  quoteId: 'quote-1',
  rfqId: 'rfq-1',
  takerAmount: '1.932381',
  totalRequired: '1',
} as ComboQuote;

describe('requestComboQuote', () => {
  it('builds the BUY request and returns a self-contained quote', async () => {
    const { client, gatewayPost } = createClient({
      postResults: [okAsync(jsonResponse(quoteReadyWire))],
    });

    const result = await requestComboQuote(client, buyRequest);

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
    expect(result).toEqual({ quote: comboQuote, rfqId: 'rfq-1' });
  });

  it('maps SELL size to outcome-token base units', async () => {
    const { client, gatewayPost } = createClient({
      postResults: [okAsync(jsonResponse(quoteReadyWire))],
    });

    const result = await requestComboQuote(client, {
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
    expect(result.quote).toMatchObject({ direction: OrderSide.SELL });
  });

  it('returns no quote as a business outcome', async () => {
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

    await expect(requestComboQuote(client, buyRequest)).resolves.toEqual({
      quote: null,
      reason: ComboQuoteUnavailableReason.NoQuotes,
      rfqId: 'rfq-2',
    });
  });

  it('rejects canonically duplicate leg IDs before transport', async () => {
    const { client, gatewayPost } = createClient();

    await expect(
      requestComboQuote(client, {
        amount: 100,
        direction: OrderSide.BUY,
        legPositionIds: ['01', '1'],
      }),
    ).rejects.toBeInstanceOf(UserInputError);
    expect(gatewayPost).not.toHaveBeenCalled();
  });

  it('requires builder authorization before transport', async () => {
    const { client, gatewayPost } = createClient({ hasBuilderApiKey: false });

    await expect(requestComboQuote(client, buyRequest)).rejects.toMatchObject({
      message: expect.stringContaining('require a Builder API Key'),
      name: 'UserInputError',
    });
    expect(gatewayPost).not.toHaveBeenCalled();
  });

  it('classifies request rejections and preserves their cause', async () => {
    const rejection = new RequestRejectedError('contradictory legs', {
      code: 'CONTRADICTORY_LEGS',
      status: 400,
    });
    const { client } = createClient({ postResults: [errAsync(rejection)] });

    const error = await requestComboQuote(client, buyRequest).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(RfqRequestRejectedError);
    expect(error).toMatchObject({
      cause: rejection,
      code: RfqRejectionCode.ContradictoryLegs,
      status: 400,
    });
  });

  it('handles future error codes on both response paths', async () => {
    const finalStateError = {
      code: 'SOMETHING_NEW',
      message: 'something new',
    };
    const finalStateClient = createClient({
      postResults: [
        okAsync(
          jsonResponse({
            rfq_id: 'rfq-3',
            status: 'FAILED',
            builder_code: BUILDER_CODE,
            error: finalStateError,
          }),
        ),
      ],
    }).client;

    await expect(
      requestComboQuote(finalStateClient, buyRequest),
    ).rejects.toMatchObject({
      cause: finalStateError,
      code: RfqRejectionCode.InvalidRfq,
      name: 'RfqRequestRejectedError',
      status: 200,
    });

    const rejection = new RequestRejectedError('something new', {
      code: 'SOMETHING_NEW',
      status: 400,
    });
    const rejectedClient = createClient({
      postResults: [errAsync(rejection)],
    }).client;

    await expect(
      requestComboQuote(rejectedClient, buyRequest),
    ).rejects.toMatchObject({
      cause: rejection,
      code: RfqRejectionCode.InvalidRfq,
      name: 'RfqRequestRejectedError',
    });
  });
});

describe('acceptComboQuote', () => {
  it('accepts a serialized quote with a recreated client', async () => {
    const requester = createClient({
      postResults: [okAsync(jsonResponse(quoteReadyWire))],
    });
    const acceptor = createClient({
      postResults: [
        okAsync(
          jsonResponse({
            rfq_id: 'rfq-1',
            status: 'EXECUTING',
            taker_order_hash: TAKER_ORDER_HASH,
          }),
        ),
      ],
    });
    const requested = await requestComboQuote(requester.client, buyRequest);

    if (requested.quote === null) {
      expect.unreachable('Expected a winning quote');
    }

    const serializedQuote = JSON.parse(
      JSON.stringify(requested.quote),
    ) as ComboQuote;
    const result = await acceptComboQuote(acceptor.client, serializedQuote);

    expect(acceptor.signTypedData).toHaveBeenCalledTimes(1);
    expect(acceptor.gatewayPost).toHaveBeenCalledWith(
      '/v1/builder/rfq/requests/rfq-1/accept',
      {
        json: {
          quote_id: 'quote-1',
          signed_order: expect.objectContaining({
            builder: BUILDER_CODE,
            maker: SIGNER,
            makerAmount: '966191',
            metadata: `0x${'0'.repeat(64)}`,
            side: 0,
            signature: SIGNATURE,
            signatureType: 0,
            signer: SIGNER,
            takerAmount: '1932381',
            tokenId: '789',
          }),
        },
        timeout: 30_000,
      },
    );
    expect(result).toEqual({
      rfqId: 'rfq-1',
      status: 'executing',
      takerOrderHash: TAKER_ORDER_HASH,
    });
  });

  it('retries a dropped acceptance and permits a status-only response', async () => {
    const { client, gatewayPost, signTypedData } = createClient({
      postResults: [
        errAsync(new TransportError('socket hang up')),
        okAsync(jsonResponse({ rfq_id: 'rfq-1', status: 'EXECUTING' })),
      ],
    });

    await expect(acceptComboQuote(client, comboQuote)).resolves.toEqual({
      rfqId: 'rfq-1',
      status: 'executing',
    });
    expect(signTypedData).toHaveBeenCalledTimes(1);
    expect(gatewayPost).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      expected: {
        error: { code: 'MAKER_DECLINED', message: 'maker declined' },
        reason: ComboAcceptFailureReason.MakerDeclined,
        rfqId: 'rfq-1',
        status: 'failed',
      },
      name: 'maker decline',
      response: okAsync(
        jsonResponse({
          rfq_id: 'rfq-1',
          status: 'FAILED',
          error: { code: 'MAKER_DECLINED', message: 'maker declined' },
        }),
      ),
    },
    {
      expected: {
        error: { code: 'EXPIRED_RFQ', message: 'expired rfq' },
        reason: ComboAcceptFailureReason.AcceptanceWindowExpired,
        rfqId: 'rfq-1',
        status: 'failed',
      },
      name: 'expired acceptance window',
      response: errAsync(
        new RequestRejectedError('expired rfq', {
          code: 'EXPIRED_RFQ',
          status: 409,
        }),
      ),
    },
  ])('maps a $name to a failed result', async ({ expected, response }) => {
    const { client } = createClient({ postResults: [response] });

    await expect(acceptComboQuote(client, comboQuote)).resolves.toEqual(
      expected,
    );
  });

  it('polls when the maker outcome is still pending', async () => {
    const { client, gatewayGet } = createClient({
      getResults: [
        okAsync(jsonResponse({ rfq_id: 'rfq-1', status: 'EXECUTING' })),
      ],
      postResults: [
        okAsync(
          jsonResponse({
            rfq_id: 'rfq-1',
            status: 'AWAITING_MAKER_CONFIRMATION',
            taker_order_hash: TAKER_ORDER_HASH,
          }),
        ),
      ],
    });

    await expect(acceptComboQuote(client, comboQuote)).resolves.toEqual({
      rfqId: 'rfq-1',
      status: 'executing',
      takerOrderHash: TAKER_ORDER_HASH,
    });
    expect(gatewayGet).toHaveBeenCalledWith('/v1/builder/rfq/requests/rfq-1');
  }, 10_000);
});

describe('waitForComboFill', () => {
  it('returns terminal failures with their structured error', async () => {
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

  it('throws when the RFQ stays non-terminal past the deadline', async () => {
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

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}
