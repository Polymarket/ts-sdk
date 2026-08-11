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
import { RequestRejectedError, UserInputError } from '../errors';
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
  it('parses the plan response', async () => {
    const { client } = createClient();

    const plan = await planCollateralReturn(client);

    expect(plan.planHash).toBe(PLAN_HASH);
    expect(plan.blockNumber).toBe(74000000n);
    expect(plan.netPusdOut).toBe('1.000000');
    expect(plan.requiredPositions).toEqual([
      { positionId: '123', amount: '2' },
    ]);
    // Wire condition IDs arrive padded to 32 bytes and amounts in base units.
    expect(plan.operations[0]).toMatchObject({
      kind: 'merge',
      conditionId: `0x03${'ab'.repeat(29)}01`,
      amount: '1',
    });
    expect(plan.routerCall).toEqual({
      to: production.contracts.protocolV2Router,
      data: ROUTER_DATA,
    });
  });

  it('passes unknown operation kinds through', async () => {
    const { client } = createClient({
      planOverrides: {
        operations: [{ kind: 'not_yet_known_kind', amount: '1000000' }],
      },
    });

    const plan = await planCollateralReturn(client);

    expect(plan.operations[0]?.kind).toBe('not_yet_known_kind');
  });

  it('rejects EOA-bound accounts', async () => {
    const { client } = createClient({ walletType: WalletType.EOA });

    await expect(planCollateralReturn(client)).rejects.toThrow(
      /Deposit Wallet, Safe Wallet, and Proxy Wallet accounts/,
    );
  });
});

describe('executeCollateralReturnPlan', () => {
  it('signs and submits the planned router call', async () => {
    const { client, collateralReturnPost, signTypedData } = createClient();
    const plan = await planCollateralReturn(client);

    const handle = await executeCollateralReturnPlan(client, { plan });

    expect(handle.transactionId).toBe('tx-1');
    expect(signTypedData).toHaveBeenCalledTimes(1);
    expect(findSubmitPayload(collateralReturnPost)).toMatchObject({
      plan_hash: PLAN_HASH,
      envelope: {
        type: 'WALLET',
        depositWalletParams: {
          calls: [
            {
              target: production.contracts.protocolV2Router,
              value: '0',
              data: ROUTER_DATA,
            },
          ],
        },
      },
    });
  });

  it('rejects EOA-bound accounts', async () => {
    const { client } = createClient();
    const plan = await planCollateralReturn(client);
    const { client: eoaClient } = createClient({ walletType: WalletType.EOA });

    await expect(
      executeCollateralReturnPlan(eoaClient, { plan }),
    ).rejects.toThrow(/Deposit Wallet, Safe Wallet, and Proxy Wallet accounts/);
  });

  it('submits a Safe envelope carrying the router call for Safe accounts', async () => {
    const { client, collateralReturnPost, signMessage } = createClient({
      walletType: WalletType.GNOSIS_SAFE,
    });
    const plan = await planCollateralReturn(client);

    const handle = await executeCollateralReturnPlan(client, { plan });

    expect(handle.transactionId).toBe('tx-1');
    expect(signMessage).toHaveBeenCalledTimes(1);
    expect(findSubmitPayload(collateralReturnPost)).toMatchObject({
      plan_hash: PLAN_HASH,
      envelope: {
        type: 'SAFE',
        to: production.contracts.protocolV2Router,
        data: ROUTER_DATA,
      },
    });
  });

  it('submits a Proxy envelope wrapping the router call for proxy accounts', async () => {
    const { client, collateralReturnPost, signMessage } = createClient({
      walletType: WalletType.POLY_PROXY,
    });
    const plan = await planCollateralReturn(client);

    const handle = await executeCollateralReturnPlan(client, { plan });

    expect(handle.transactionId).toBe('tx-1');
    expect(signMessage).toHaveBeenCalledTimes(1);
    expect(findSubmitPayload(collateralReturnPost)).toMatchObject({
      plan_hash: PLAN_HASH,
      envelope: {
        type: 'PROXY',
        data: encodeProxyCall([
          {
            data: ROUTER_DATA as HexString,
            to: production.contracts.protocolV2Router,
            value: 0n,
          },
        ]),
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

  it('rejects a plan created for a different chain', async () => {
    const { client } = createClient();
    const plan = await planCollateralReturn(client);

    await expect(
      executeCollateralReturnPlan(client, {
        plan: { ...plan, chainId: 80002 },
      }),
    ).rejects.toThrow(UserInputError);
  });

  it('does not retry plan rejections', async () => {
    const { client, collateralReturnPost } = createClient({
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
      RequestRejectedError,
    );
    expect(countSubmitCalls(collateralReturnPost)).toBe(1);
  });

  it('re-signs and resubmits after a transient relayer rejection', async () => {
    const { client, collateralReturnPost, signTypedData } = createClient({
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
    expect(countSubmitCalls(collateralReturnPost)).toBe(2);
  });

  it('re-signs with the nonce from a submit nonce rejection and resubmits once', async () => {
    const { client, collateralReturnPost } = createClient({
      submitResults: [
        errAsync(
          new RequestRejectedError(
            'batch nonce 7 does not match on-chain nonce 9 (https://combos-rfq-collateral-return.polymarket.com/v1/collateral-return/submit)',
            { status: 400 },
          ),
        ),
        okAsync(jsonResponse(submitResponseWire)),
      ],
    });
    const plan = await planCollateralReturn(client);

    const handle = await executeCollateralReturnPlan(client, { plan });

    expect(handle.transactionId).toBe('tx-1');
    const payloads = submitPayloads(collateralReturnPost);
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toMatchObject({ envelope: { nonce: '9' } });
  });
});

type CreateClientOptions = {
  walletType?: WalletType;
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
    combos: { post: collateralReturnPost },
    environment,
    relayer: { get: relayerGet },
    rpc: { ethEstimateGas },
    signer,
    supportsGasless: true,
  } as unknown as BaseSecureClient;

  return {
    client,
    collateralReturnPost,
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

function countSubmitCalls(
  collateralReturnPost: ReturnType<typeof vi.fn>,
): number {
  return collateralReturnPost.mock.calls.filter(
    ([path]) => path === '/v1/collateral-return/submit',
  ).length;
}

function submitPayloads(
  collateralReturnPost: ReturnType<typeof vi.fn>,
): unknown[] {
  return collateralReturnPost.mock.calls
    .filter(([path]) => path === '/v1/collateral-return/submit')
    .map(([, options]) => (options as { json?: unknown } | undefined)?.json);
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}
