import { describe, expect, it } from './fixtures';

describe('Account funding', () => {
  it('creates deposit addresses for a public-client wallet', async ({
    publicClient,
  }) => {
    const result = await publicClient.createDepositAddresses({
      wallet: '0x0000000000000000000000000000000000000001',
    });

    expect(result.addresses).toEqual(
      expect.objectContaining({
        btc: expect.any(String),
        evm: expect.any(String),
        svm: expect.any(String),
      }),
    );
  });

  it('uses the account wallet when a secure client creates deposit addresses', async ({
    secureClientWithDepositWallet,
  }) => {
    const result = await secureClientWithDepositWallet.createDepositAddresses();

    expect(result.addresses).toEqual(
      expect.objectContaining({
        btc: expect.any(String),
        evm: expect.any(String),
        svm: expect.any(String),
      }),
    );
  });

  it('creates addresses for a withdrawal destination', async ({
    publicClient,
  }) => {
    const result = await publicClient.createWithdrawalAddresses({
      destination: {
        chainId: '137',
        recipientAddress: '0x0000000000000000000000000000000000000001',
        tokenAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      },
      wallet: '0x0000000000000000000000000000000000000001',
    });

    expect(result.addresses).toEqual(
      expect.objectContaining({
        btc: expect.any(String),
        evm: expect.any(String),
        svm: expect.any(String),
      }),
    );
  });

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

  it('fetches transactions for a documented bridge address', async ({
    publicClient,
  }) => {
    const transactions = await publicClient.fetchFundingTransactions({
      address: '0x23566f8b2E82aDfCf01846E54899d110e97AC053',
    });

    expect(transactions.length).toBeGreaterThan(0);
    expect(transactions[0]).toEqual(
      expect.objectContaining({
        fromAmountBaseUnit: expect.any(String),
        fromChainId: expect.any(String),
        fromTokenAddress: expect.any(String),
        status: expect.any(String),
        toChainId: expect.any(String),
        toTokenAddress: expect.any(String),
      }),
    );
  });
});
