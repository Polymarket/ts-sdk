import { WalletType } from '@polymarket/bindings/gamma';
import {
  errAsync,
  expectEvmAddress,
  type HexString,
  okAsync,
  type ResultAsync,
} from '@polymarket/types';
import { describe, expect, it, vi } from 'vitest';
import { encodeProxyCall } from '../abis';
import type { BaseSecureClient } from '../clients';
import { forkEnvironmentConfig, production } from '../environments';
import {
  CollateralReturnPlanRejectedError,
  MissingTradingApprovalsError,
  RequestRejectedError,
  UserInputError,
} from '../errors';
import type { EthCallRequest } from '../rpc';
import type { Signer } from '../types';
import {
  executeCollateralReturnPlan,
  planCollateralReturn,
} from './collateral-return';

const SIGNER = expectEvmAddress('0x1111111111111111111111111111111111111111');
const WALLET = expectEvmAddress('0x2222222222222222222222222222222222222222');
const RELAY = expectEvmAddress('0x3333333333333333333333333333333333333333');
const SIGNATURE = `0x${'11'.repeat(65)}`;
const PLAN_HASH = `0x${'ab'.repeat(32)}`;
const ROUTER_DATA = '0xdeadbeef';

const ZERO_RESULT = `0x${'0'.repeat(64)}` as HexString;
const TRUE_RESULT = `0x${'0'.repeat(63)}1` as HexString;
const MAX_UINT256_RESULT = `0x${'f'.repeat(64)}` as HexString;

const environment = forkEnvironmentConfig({
  name: 'test',
  relayerPollFrequencyMs: 0,
});

type PlanWireOperation = {
  kind: string;
  condition_id?: string;
  event_id?: string;
  position_id?: string;
  condition_index?: number;
  amount: string;
};

const planWire = {
  plan_hash: PLAN_HASH,
  chain_id: 137,
  wallet: WALLET,
  block_number: '74000000',
  starting_pusd: '123.456789',
  net_pusd_out: '1.000000',
  final_pusd: '124.456789',
  operations: [
    {
      // The wire pads bytes31 condition IDs to 32 bytes.
      kind: 'merge',
      condition_id: `0x03${'ab'.repeat(29)}0100`,
      amount: '1000000',
    },
    {
      kind: 'extract',
      position_id: '123',
      condition_index: 2,
      amount: '500000',
    },
  ] as PlanWireOperation[],
  operation_count: 2,
  truncated: true,
  estimated_cost: 1240,
  required_pusd_input: '0.000000',
  required_positions: [{ position_id: '123', amount: '2000000' }],
  position_summary: {
    consumed: [{ position_id: '123', amount: '2000000' }],
    created: [{ position_id: '456', amount: '1500000' }],
  },
  candidate_position_ids: ['123'],
  router_call: {
    to: production.contracts.protocolV2Router,
    data: ROUTER_DATA,
  },
};

const executeParamsWire = { address: RELAY, nonce: '7' };
const submitResponseWire = {
  state: 'STATE_NEW',
  transactionHash: null,
  transactionID: 'tx-1',
};

describe('planCollateralReturn', () => {
  it('maps the plan response into the public plan shape', async () => {
    const { client, collateralReturnPost } = createClient();

    const plan = await planCollateralReturn(client);

    expect(collateralReturnPost).toHaveBeenCalledWith(
      '/v1/collateral-return/plan',
      { json: { wallet: WALLET } },
    );
    expect(plan).toEqual({
      planHash: PLAN_HASH,
      wallet: WALLET,
      chainId: 137,
      blockNumber: 74000000n,
      startingCollateral: '123.456789',
      collateralReturned: '1.000000',
      finalCollateral: '124.456789',
      requiredCollateral: '0.000000',
      requiredPositions: [{ positionId: '123', amount: '2' }],
      positionSummary: {
        consumed: [{ positionId: '123', amount: '2' }],
        created: [{ positionId: '456', amount: '1.5' }],
      },
      operations: [
        {
          kind: 'merge',
          conditionId: `0x03${'ab'.repeat(29)}01`,
          conditionIndex: 0,
          eventId: undefined,
          positionId: undefined,
          amount: '1',
        },
        {
          kind: 'extract',
          conditionId: undefined,
          conditionIndex: 2,
          eventId: undefined,
          positionId: '123',
          amount: '0.5',
        },
      ],
      truncated: true,
      routerCall: {
        to: production.contracts.protocolV2Router,
        data: ROUTER_DATA,
      },
    });
  });

  it('maps event ids and passes unknown operation kinds through', async () => {
    const eventId = `0x${'ab'.repeat(31)}`;
    const { client } = createClient({
      planOverrides: {
        operations: [
          { kind: 'convert_on_event', event_id: eventId, amount: '250000' },
          { kind: 'not_yet_known_kind', amount: '1000000' },
        ],
      },
    });

    const plan = await planCollateralReturn(client);

    expect(plan.operations).toEqual([
      {
        kind: 'convert_on_event',
        conditionId: undefined,
        conditionIndex: 0,
        eventId,
        positionId: undefined,
        amount: '0.25',
      },
      {
        kind: 'not_yet_known_kind',
        conditionId: undefined,
        conditionIndex: 0,
        eventId: undefined,
        positionId: undefined,
        amount: '1',
      },
    ]);
  });

  it('maps an empty plan with nothing to return', async () => {
    const { client } = createClient({
      planOverrides: {
        operations: [],
        operation_count: 0,
        truncated: false,
        net_pusd_out: '0.000000',
        final_pusd: '123.456789',
        required_positions: [],
        position_summary: { consumed: [], created: [] },
        candidate_position_ids: [],
      },
    });

    const plan = await planCollateralReturn(client);

    expect(plan.collateralReturned).toBe('0.000000');
    expect(plan.operations).toEqual([]);
    expect(plan.requiredPositions).toEqual([]);
    expect(plan.positionSummary).toEqual({ consumed: [], created: [] });
    expect(plan.truncated).toBe(false);
  });

  it('defaults the position summary when the service omits it', async () => {
    const { client } = createClient({
      planOverrides: { position_summary: undefined },
    });

    const plan = await planCollateralReturn(client);

    expect(plan.positionSummary).toEqual({ consumed: [], created: [] });
  });

  it('rejects EOA-bound accounts', async () => {
    const { client } = createClient({ walletType: WalletType.EOA });

    await expect(planCollateralReturn(client)).rejects.toThrow(
      /Deposit Wallet, Safe-backed, and proxy-backed accounts/,
    );
  });
});

describe('executeCollateralReturnPlan', () => {
  it('signs and submits exactly the planned router call', async () => {
    const { client, collateralReturnPost, ethCallBatch, signTypedData } =
      createClient({ ethCallResults: [TRUE_RESULT] });
    const plan = await planCollateralReturn(client);

    const handle = await executeCollateralReturnPlan(client, { plan });

    expect(handle.transactionId).toBe('tx-1');
    expect(signTypedData).toHaveBeenCalledTimes(1);
    expect(ethCallBatch).toHaveBeenCalledTimes(1);
    expect(ethCallBatch.mock.calls[0]?.[0]).toHaveLength(1);

    const submitCall = collateralReturnPost.mock.calls.find(
      ([path]) => path === '/v1/collateral-return/submit',
    );
    expect(submitCall).toBeDefined();
    const payload = submitCall?.[1]?.json as {
      plan_hash: string;
      envelope: {
        type: string;
        from: string;
        nonce: string;
        depositWalletParams: {
          depositWallet: string;
          calls: Array<{ target: string; value: string; data: string }>;
        };
      };
    };
    expect(payload.plan_hash).toBe(PLAN_HASH);
    expect(payload.envelope.type).toBe('WALLET');
    expect(payload.envelope.from).toBe(SIGNER);
    expect(payload.envelope.nonce).toBe('7');
    expect(payload.envelope.depositWalletParams.depositWallet).toBe(WALLET);
    expect(payload.envelope.depositWalletParams.calls).toEqual([
      {
        target: production.contracts.protocolV2Router,
        value: '0',
        data: ROUTER_DATA,
      },
    ]);
  });

  it('rejects EOA-bound accounts', async () => {
    const { client } = createClient();
    const plan = await planCollateralReturn(client);
    const { client: eoaClient } = createClient({ walletType: WalletType.EOA });

    await expect(
      executeCollateralReturnPlan(eoaClient, { plan }),
    ).rejects.toThrow(/Deposit Wallet, Safe-backed, and proxy-backed accounts/);
  });

  it('submits a Safe envelope carrying the exact router call for Safe accounts', async () => {
    const { client, collateralReturnPost, signMessage } = createClient({
      ethCallResults: [TRUE_RESULT],
      walletType: WalletType.GNOSIS_SAFE,
    });
    const plan = await planCollateralReturn(client);

    const handle = await executeCollateralReturnPlan(client, { plan });

    expect(handle.transactionId).toBe('tx-1');
    expect(signMessage).toHaveBeenCalledTimes(1);

    const payload = findSubmitPayload(collateralReturnPost) as {
      plan_hash: string;
      envelope: Record<string, unknown>;
    };
    expect(payload.plan_hash).toBe(PLAN_HASH);
    expect(payload.envelope).toMatchObject({
      type: 'SAFE',
      from: SIGNER,
      to: production.contracts.protocolV2Router,
      proxyWallet: WALLET,
      data: ROUTER_DATA,
      nonce: '7',
      signatureParams: {
        baseGas: '0',
        gasPrice: '0',
        gasToken: `0x${'0'.repeat(40)}`,
        operation: '0',
        refundReceiver: `0x${'0'.repeat(40)}`,
        safeTxnGas: '0',
      },
    });
  });

  it('submits a Proxy envelope wrapping the exact router call for proxy accounts', async () => {
    const { client, collateralReturnPost, signMessage } = createClient({
      ethCallResults: [TRUE_RESULT],
      walletType: WalletType.POLY_PROXY,
    });
    const plan = await planCollateralReturn(client);

    const handle = await executeCollateralReturnPlan(client, { plan });

    expect(handle.transactionId).toBe('tx-1');
    expect(signMessage).toHaveBeenCalledTimes(1);

    const payload = findSubmitPayload(collateralReturnPost) as {
      plan_hash: string;
      envelope: Record<string, unknown>;
    };
    expect(payload.plan_hash).toBe(PLAN_HASH);
    expect(payload.envelope).toMatchObject({
      type: 'PROXY',
      from: SIGNER,
      to: production.walletDerivation.proxyFactory,
      proxyWallet: WALLET,
      nonce: '7',
      data: encodeProxyCall([
        {
          data: ROUTER_DATA as HexString,
          to: production.contracts.protocolV2Router,
          value: 0n,
        },
      ]),
      signatureParams: {
        gasLimit: '500000',
        gasPrice: '0',
        relay: RELAY,
        relayHub: production.contracts.relayHub,
        relayerFee: '0',
      },
    });
  });

  it('rejects a plan created for a different wallet', async () => {
    const { client } = createClient();
    const plan = await planCollateralReturn(client);

    await expect(
      executeCollateralReturnPlan(client, {
        plan: { ...plan, wallet: SIGNER },
      }),
    ).rejects.toThrow(UserInputError);
  });

  it('fails fast on missing approvals before requesting a signature', async () => {
    const { client, relayerGet, signTypedData } = createClient({
      ethCallResults: [ZERO_RESULT, ZERO_RESULT],
      planOverrides: { required_pusd_input: '5.000000' },
    });
    const plan = await planCollateralReturn(client);

    await expect(executeCollateralReturnPlan(client, { plan })).rejects.toThrow(
      MissingTradingApprovalsError,
    );
    expect(relayerGet).not.toHaveBeenCalled();
    expect(signTypedData).not.toHaveBeenCalled();
  });

  it('executes when the wallet holds both required approvals', async () => {
    const { client, ethCallBatch } = createClient({
      ethCallResults: [MAX_UINT256_RESULT, TRUE_RESULT],
      planOverrides: { required_pusd_input: '5.000000' },
    });
    const plan = await planCollateralReturn(client);

    const handle = await executeCollateralReturnPlan(client, { plan });

    expect(handle.transactionId).toBe('tx-1');
    expect(ethCallBatch).toHaveBeenCalledTimes(1);
    expect(ethCallBatch.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('skips the approval pre-check when the plan needs no inputs', async () => {
    const { client, ethCallBatch } = createClient({
      planOverrides: { required_positions: [] },
    });
    const plan = await planCollateralReturn(client);

    await executeCollateralReturnPlan(client, { plan });

    expect(ethCallBatch).not.toHaveBeenCalled();
  });

  it('maps plan rejections to CollateralReturnPlanRejectedError without retrying', async () => {
    const { client, collateralReturnPost } = createClient({
      ethCallResults: [TRUE_RESULT],
      submitResults: [
        errAsync(
          new RequestRejectedError(
            'fresh plan required: router inputs do not match the current program',
            { status: 409 },
          ),
        ),
      ],
    });
    const plan = await planCollateralReturn(client);

    await expect(executeCollateralReturnPlan(client, { plan })).rejects.toThrow(
      CollateralReturnPlanRejectedError,
    );

    const submitCalls = collateralReturnPost.mock.calls.filter(
      ([path]) => path === '/v1/collateral-return/submit',
    );
    expect(submitCalls).toHaveLength(1);
  });

  it('re-signs and resubmits after a transient relayer rejection', async () => {
    const { client, collateralReturnPost, signTypedData } = createClient({
      ethCallResults: [TRUE_RESULT],
      submitResults: [
        errAsync(
          new RequestRejectedError(
            'wallet busy: another active action is in flight',
            { status: 400 },
          ),
        ),
        okAsync(jsonResponse(submitResponseWire)),
      ],
    });
    const plan = await planCollateralReturn(client);

    const handle = await executeCollateralReturnPlan(client, { plan });

    expect(handle.transactionId).toBe('tx-1');
    expect(signTypedData).toHaveBeenCalledTimes(2);
    const submitCalls = collateralReturnPost.mock.calls.filter(
      ([path]) => path === '/v1/collateral-return/submit',
    );
    expect(submitCalls).toHaveLength(2);
  });
});

type CreateClientOptions = {
  walletType?: WalletType;
  ethCallResults?: HexString[];
  planOverrides?: Partial<typeof planWire>;
  submitResults?: Array<ResultAsync<Response, RequestRejectedError>>;
};

function createClient(options: CreateClientOptions = {}) {
  const plan = { ...planWire, ...options.planOverrides };
  const submitQueue = [...(options.submitResults ?? [])];

  const collateralReturnPost = vi.fn(
    (path: string, _options?: { json?: unknown }) => {
      if (path === '/v1/collateral-return/plan') {
        return okAsync(jsonResponse(plan));
      }

      return submitQueue.shift() ?? okAsync(jsonResponse(submitResponseWire));
    },
  );
  const relayerGet = vi.fn(() => okAsync(jsonResponse(executeParamsWire)));
  const ethCallBatch = vi.fn(
    async (_calls: readonly EthCallRequest[]): Promise<HexString[]> =>
      options.ethCallResults ?? [],
  );
  const ethEstimateGas = vi.fn(async () => 500_000n);
  const signTypedData = vi.fn(async () => SIGNATURE);
  const signMessage = vi.fn(async () => SIGNATURE);

  const signer = {
    getAddress: async () => SIGNER,
    signMessage,
    signTypedData,
    sendTransaction: vi.fn(),
  } as unknown as Signer;

  const client = {
    account: {
      signer: SIGNER,
      wallet: WALLET,
      walletType: options.walletType ?? WalletType.DEPOSIT_WALLET,
    },
    collateralReturn: { post: collateralReturnPost },
    environment,
    relayer: { get: relayerGet },
    rpc: { ethCallBatch, ethEstimateGas },
    signer,
    supportsGasless: true,
  } as unknown as BaseSecureClient;

  return {
    client,
    collateralReturnPost,
    ethCallBatch,
    relayerGet,
    signMessage,
    signTypedData,
  };
}

function findSubmitPayload(
  collateralReturnPost: ReturnType<typeof vi.fn>,
): unknown {
  const submitCall = collateralReturnPost.mock.calls.find(
    ([path]) => path === '/v1/collateral-return/submit',
  );
  expect(submitCall).toBeDefined();

  return (submitCall?.[1] as { json?: unknown } | undefined)?.json;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}
