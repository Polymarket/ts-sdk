import { AssetType } from '@polymarket/bindings/clob';
import {
  KnownFundingTransactionStatus,
  RequestRejectedError,
  type SecureClient,
  type TransactionHandle,
  UserInputError,
} from '@polymarket/client';
import {
  type PrepareErc20TransferRequest,
  updateBalanceAllowance,
} from '@polymarket/client/actions';
import { describe, expect, it, runMeteredTests } from './fixtures';

const POLYGON_CHAIN_ID = '137';
const POLYGON_NATIVE_USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const POLYGON_PUSD = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';
const WITHDRAWAL_AMOUNT = 2_300_000n;
const DEPOSIT_AMOUNT = 2_200_000n;
const MIN_DEPOSIT_OUTPUT = 2_150_000n;
const MIN_DEPOSIT_RECEIVED = 2.15;
const MIN_WITHDRAWAL_RECEIVED = 2.2;

describe('Account funding', () => {
  it('fetches the currently supported assets', async ({ publicClient }) => {
    const assets = await publicClient.fetchSupportedFundingAssets();

    expect(assets.length).toBeGreaterThan(0);
    expect(assets[0]).toEqual(
      expect.objectContaining({
        chainId: expect.any(String),
        chainName: expect.any(String),
        minCheckoutUsd: expect.any(Number),
        token: expect.objectContaining({
          address: expect.any(String),
          decimals: expect.any(Number),
          name: expect.any(String),
          symbol: expect.any(String),
        }),
      }),
    );
  });

  it('fetches a funding quote', async ({ publicClient }) => {
    const quote = await publicClient.fetchFundingQuote({
      amount: 10_000_000n,
      source: {
        chainId: '137',
        tokenAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      },
      destination: {
        chainId: '137',
        tokenAddress: '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB',
        recipientAddress: '0x0000000000000000000000000000000000000001',
      },
    });

    expect(quote.quoteId).toEqual(expect.any(String));
    expect(quote.estToTokenBaseUnit).toMatch(/^\d+$/);
  });

  it('rejects malformed EVM withdrawal recipients', async ({
    publicClient,
  }) => {
    await expect(
      publicClient.createWithdrawalAddresses({
        destination: {
          chainId: POLYGON_CHAIN_ID,
          recipientAddress: 'not-an-address',
          tokenAddress: POLYGON_NATIVE_USDC,
        },
        wallet: '0x0000000000000000000000000000000000000001',
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        'destination.recipientAddress: Expected an EVM address',
      ),
      name: UserInputError.name,
    });
  });

  it('lists transaction pages for a documented bridge address', async ({
    publicClient,
  }) => {
    const paginator = publicClient.listFundingTransactions({
      address: '0x23566f8b2E82aDfCf01846E54899d110e97AC053',
      pageSize: 1,
    });

    let pageCount = 0;
    let transactionCount = 0;
    let reachedTerminalPage = false;

    for await (const page of paginator) {
      pageCount += 1;
      transactionCount += page.items.length;
      reachedTerminalPage = !page.hasMore;

      // Continued pages must honor the requested size and expose a cursor.
      if (page.hasMore) {
        expect(page.items.length).toBeLessThanOrEqual(1);
        expect(page.nextCursor).toEqual(expect.any(String));
      }

      for (const transaction of page.items) {
        expect(transaction).toEqual(
          expect.objectContaining({
            fromAmountBaseUnit: expect.any(String),
            fromChainId: expect.any(String),
            fromTokenAddress: expect.any(String),
            status: expect.any(String),
            toChainId: expect.any(String),
            toTokenAddress: expect.any(String),
          }),
        );
      }
    }

    expect(pageCount).toBeGreaterThan(0);
    expect(transactionCount).toBeGreaterThan(0);
    expect(reachedTerminalPage).toBe(true);
  });

  // This round trip irreversibly spends bridge fees and moves 2.30 pUSD plus
  // 2.20 USDC of live funds. It is opt-in, guards both routes before the first
  // transfer, and refreshes the deposit quote immediately before that transfer.
  it.runIf(runMeteredTests)(
    'round-trips pUSD through the bridge',
    async ({ builderCode, secureClientWithDepositWallet, skip }) => {
      const client = secureClientWithDepositWallet;

      if (
        client.environment.name !== 'production' ||
        client.environment.chainId !== Number(POLYGON_CHAIN_ID) ||
        client.environment.bridge.rest !== 'https://bridge.polymarket.com' ||
        client.environment.contracts.collateralToken.toLowerCase() !==
          POLYGON_PUSD.toLowerCase()
      ) {
        skip(
          'The metered bridge round trip is restricted to Polygon production',
        );
        return;
      }

      const assets = await client.fetchSupportedFundingAssets();
      const nativeUsdc = assets.find(
        (asset) =>
          asset.chainId === POLYGON_CHAIN_ID &&
          asset.token.address.toLowerCase() ===
            POLYGON_NATIVE_USDC.toLowerCase(),
      );
      const pusd = assets.find(
        (asset) =>
          asset.chainId === POLYGON_CHAIN_ID &&
          asset.token.address.toLowerCase() === POLYGON_PUSD.toLowerCase(),
      );

      if (nativeUsdc === undefined || pusd === undefined) {
        skip('The required Polygon funding assets are unavailable');
        return;
      }

      if (nativeUsdc.token.decimals !== 6 || pusd.token.decimals !== 6) {
        skip('The metered amounts require six-decimal Polygon funding assets');
        return;
      }

      if (nativeUsdc.minCheckoutUsd > 2.2 || pusd.minCheckoutUsd > 2.3) {
        skip('The metered amounts are below the current funding minimums');
        return;
      }

      const balanceAllowance = await updateBalanceAllowance(client, {
        assetType: AssetType.COLLATERAL,
      });
      const startingCollateralBalance = BigInt(balanceAllowance.balance);
      if (startingCollateralBalance < WITHDRAWAL_AMOUNT) {
        skip('The integration wallet has insufficient pUSD for the round trip');
        return;
      }

      const withdrawalQuote = await client.fetchFundingQuote({
        amount: WITHDRAWAL_AMOUNT,
        source: {
          chainId: POLYGON_CHAIN_ID,
          tokenAddress: POLYGON_PUSD,
        },
        destination: {
          chainId: POLYGON_CHAIN_ID,
          tokenAddress: POLYGON_NATIVE_USDC,
          recipientAddress: client.account.wallet,
        },
      });
      const depositPreflightQuote = await client.fetchFundingQuote({
        amount: DEPOSIT_AMOUNT,
        source: {
          chainId: POLYGON_CHAIN_ID,
          tokenAddress: POLYGON_NATIVE_USDC,
        },
        destination: {
          chainId: POLYGON_CHAIN_ID,
          tokenAddress: POLYGON_PUSD,
          recipientAddress: client.account.wallet,
        },
      });

      if (
        withdrawalQuote.estFeeBreakdown.minReceived < MIN_WITHDRAWAL_RECEIVED ||
        BigInt(withdrawalQuote.estToTokenBaseUnit) < DEPOSIT_AMOUNT ||
        BigInt(depositPreflightQuote.estToTokenBaseUnit) < MIN_DEPOSIT_OUTPUT ||
        depositPreflightQuote.estFeeBreakdown.minReceived < MIN_DEPOSIT_RECEIVED
      ) {
        skip('The live quotes cannot safely complete the metered round trip');
        return;
      }

      // Withdrawal addresses are destination-specific and should only be
      // generated when the transfer is ready to execute.
      const withdrawal = await client.createWithdrawalAddresses({
        builderCode,
        destination: {
          chainId: POLYGON_CHAIN_ID,
          recipientAddress: client.account.wallet,
          tokenAddress: POLYGON_NATIVE_USDC,
        },
      });
      const withdrawalNotBefore = Date.now() - 60_000;
      const withdrawalTransfer = await client.transferErc20({
        amount: WITHDRAWAL_AMOUNT,
        recipientAddress: withdrawal.addresses.evm,
        tokenAddress: POLYGON_PUSD,
      });
      await withdrawalTransfer.wait();
      await waitForFundingTransfer(client, {
        address: withdrawal.addresses.evm,
        amount: WITHDRAWAL_AMOUNT,
        notBefore: withdrawalNotBefore,
        tokenAddress: POLYGON_PUSD,
      });

      const depositQuote = await client.fetchFundingQuote({
        amount: DEPOSIT_AMOUNT,
        source: {
          chainId: POLYGON_CHAIN_ID,
          tokenAddress: POLYGON_NATIVE_USDC,
        },
        destination: {
          chainId: POLYGON_CHAIN_ID,
          tokenAddress: POLYGON_PUSD,
          recipientAddress: client.account.wallet,
        },
      });

      if (
        BigInt(depositQuote.estToTokenBaseUnit) < MIN_DEPOSIT_OUTPUT ||
        depositQuote.estFeeBreakdown.minReceived < MIN_DEPOSIT_RECEIVED
      ) {
        throw new Error(
          'The refreshed deposit quote is unsafe; withdrawn USDC was not deposited',
        );
      }
      const minimumReturnedCollateral = BigInt(
        Math.floor(
          depositQuote.estFeeBreakdown.minReceived * 10 ** pusd.token.decimals,
        ),
      );

      const deposit = await client.createDepositAddresses({ builderCode });
      const depositNotBefore = Date.now() - 60_000;
      const depositTransfer = await transferErc20AfterFundingSettlement(
        client,
        {
          amount: DEPOSIT_AMOUNT,
          recipientAddress: deposit.addresses.evm,
          tokenAddress: POLYGON_NATIVE_USDC,
        },
      );
      await depositTransfer.wait();
      await waitForFundingTransfer(client, {
        address: deposit.addresses.evm,
        amount: DEPOSIT_AMOUNT,
        notBefore: depositNotBefore,
        tokenAddress: POLYGON_NATIVE_USDC,
      });

      const minimumFinalCollateralBalance =
        startingCollateralBalance -
        WITHDRAWAL_AMOUNT +
        minimumReturnedCollateral;
      const finalCollateralBalance = await waitForCollateralBalance(
        client,
        minimumFinalCollateralBalance,
      );
      expect(finalCollateralBalance).toBeGreaterThanOrEqual(
        minimumFinalCollateralBalance,
      );
    },
    30 * 60_000,
  );
});

type FundingTransfer = {
  address: string;
  amount: bigint;
  notBefore: number;
  tokenAddress: string;
};

async function waitForFundingTransfer(
  client: SecureClient,
  transfer: FundingTransfer,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 8 * 60_000) {
    const page = await client
      .listFundingTransactions({ address: transfer.address })
      .firstPage();
    const transaction = page.items.find(
      (item) =>
        // Status can expose an intermediate routing token instead of the
        // requested destination token, so identify this address-specific
        // workflow by its source leg and creation time.
        item.fromAmountBaseUnit === transfer.amount.toString() &&
        item.fromTokenAddress.toLowerCase() ===
          transfer.tokenAddress.toLowerCase() &&
        item.toChainId === POLYGON_CHAIN_ID &&
        item.createdTimeMs !== undefined &&
        item.createdTimeMs >= transfer.notBefore,
    );

    if (transaction?.status === KnownFundingTransactionStatus.Completed) {
      expect(transaction.txHash).toEqual(expect.any(String));
      return;
    }

    if (transaction?.status === KnownFundingTransactionStatus.Failed) {
      throw new Error(`Bridge transfer from ${transfer.address} failed`);
    }

    await delay(10_000);
  }

  throw new Error(`Timed out waiting for transfer from ${transfer.address}`);
}

async function transferErc20AfterFundingSettlement(
  client: SecureClient,
  request: PrepareErc20TransferRequest,
): Promise<TransactionHandle> {
  const startedAt = Date.now();
  let lastError: RequestRejectedError | undefined;

  while (Date.now() - startedAt < 2 * 60_000) {
    try {
      return await client.transferErc20(request);
    } catch (error) {
      // A completed funding status can briefly lead the relayer's simulation
      // state. Retry only its explicit pre-submission revert response.
      if (
        !(error instanceof RequestRejectedError) ||
        error.status !== 400 ||
        !/batch would revert/i.test(error.message)
      ) {
        throw error;
      }

      lastError = error;
      await delay(10_000);
    }
  }

  throw new Error('Timed out waiting for withdrawn USDC to become spendable', {
    cause: lastError,
  });
}

async function waitForCollateralBalance(
  client: SecureClient,
  minimumBalance: bigint,
): Promise<bigint> {
  const startedAt = Date.now();
  let balance = 0n;

  while (Date.now() - startedAt < 60_000) {
    const balanceAllowance = await updateBalanceAllowance(client, {
      assetType: AssetType.COLLATERAL,
    });
    balance = BigInt(balanceAllowance.balance);

    if (balance >= minimumBalance) {
      return balance;
    }

    await delay(10_000);
  }

  return balance;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
