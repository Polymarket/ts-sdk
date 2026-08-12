import type {
  FundingAddressSet,
  FundingAsset,
  FundingQuote,
  FundingTransaction,
} from '@polymarket/bindings/bridge';
import type { Prettify } from '@polymarket/types';
import {
  type CreateDepositAddressesRequest,
  type CreateWithdrawalAddressesRequest,
  createDepositAddresses,
  createWithdrawalAddresses,
  type FetchFundingQuoteRequest,
  type FetchFundingTransactionsRequest,
  type FundingDestination,
  fetchFundingQuote,
  fetchFundingTransactions,
  fetchSupportedFundingAssets,
} from '../actions';
import type {
  BaseClient,
  BasePublicClient,
  BaseSecureClient,
} from '../clients';

type CommonFundingActions = {
  /**
   * Fetches the current chains and tokens supported for account funding.
   *
   * @throws {@link FetchSupportedFundingAssetsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const assets = await client.fetchSupportedFundingAssets();
   * ```
   */
  fetchSupportedFundingAssets(): Promise<FundingAsset[]>;
  /**
   * Fetches an estimated account-funding or withdrawal quote.
   *
   * @throws {@link FetchFundingQuoteError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const quote = await client.fetchFundingQuote({
   *   amount: 10_000_000n,
   *   source: {
   *     chainId: '137',
   *     tokenAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
   *   },
   *   destination: {
   *     chainId: '137',
   *     tokenAddress: '0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb',
   *     recipientAddress: '0x17ec161f126e82a8ba337f4022d574dbeafef575',
   *   },
   * });
   * ```
   */
  fetchFundingQuote(request: FetchFundingQuoteRequest): Promise<FundingQuote>;
  /**
   * Fetches deposit and withdrawal transactions for a funding address.
   *
   * @throws {@link FetchFundingTransactionsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const transactions = await client.fetchFundingTransactions({
   *   address: '0x23566f8b2e82adfcf01846e54899d110e97ac053',
   * });
   * ```
   */
  fetchFundingTransactions(
    request: FetchFundingTransactionsRequest,
  ): Promise<FundingTransaction[]>;
};

export type PublicFundingActions = Prettify<
  CommonFundingActions & {
    /**
     * Creates chain-specific addresses that fund a Polymarket wallet.
     *
     * @throws {@link CreateDepositAddressesError}
     * Thrown on failure.
     *
     * @example
     * ```ts
     * const result = await client.createDepositAddresses({
     *   wallet: '0x56687bf447db6ffa42ffe2204a05edaa20f55839',
     * });
     *
     * // result.addresses.evm
     * ```
     */
    createDepositAddresses(
      request: CreateDepositAddressesRequest,
    ): Promise<FundingAddressSet>;
    /**
     * Creates addresses configured to route funds to a withdrawal destination.
     *
     * Creating the addresses does not move funds. Send pUSD from the Polymarket
     * wallet to the returned EVM address to begin the withdrawal.
     *
     * @throws {@link CreateWithdrawalAddressesError}
     * Thrown on failure.
     *
     * @example
     * ```ts
     * const result = await client.createWithdrawalAddresses({
     *   wallet: '0x9156dd10bea4c8d7e2d591b633d1694b1d764756',
     *   destination: {
     *     chainId: '1',
     *     tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
     *     recipientAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
     *   },
     * });
     * ```
     */
    createWithdrawalAddresses(
      request: CreateWithdrawalAddressesRequest,
    ): Promise<FundingAddressSet>;
  }
>;

export type SecureCreateDepositAddressesRequest = {
  /** Optional builder code used to attribute the transfer. */
  builderCode?: string;
};

export type SecureCreateWithdrawalAddressesRequest = {
  /** Optional builder code used to attribute the transfer. */
  builderCode?: string;
  /** Destination chain, token, and recipient. */
  destination: FundingDestination;
};

export type SecureFundingActions = Prettify<
  CommonFundingActions & {
    /**
     * Creates chain-specific addresses that fund a Polymarket wallet.
     *
     * Uses the authenticated account's wallet.
     *
     * @throws {@link CreateDepositAddressesError}
     * Thrown on failure.
     *
     * @example
     * ```ts
     * const result = await client.createDepositAddresses();
     * ```
     */
    createDepositAddresses(
      request?: SecureCreateDepositAddressesRequest,
    ): Promise<FundingAddressSet>;
    /**
     * Creates addresses configured to route funds to a withdrawal destination.
     *
     * Uses the authenticated account's wallet.
     * Creating the addresses does not move funds. Send pUSD from the Polymarket
     * wallet to the returned EVM address to begin the withdrawal.
     *
     * @throws {@link CreateWithdrawalAddressesError}
     * Thrown on failure.
     *
     * @example
     * ```ts
     * const result = await client.createWithdrawalAddresses({
     *   destination: {
     *     chainId: '1',
     *     tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
     *     recipientAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
     *   },
     * });
     * ```
     */
    createWithdrawalAddresses(
      request: SecureCreateWithdrawalAddressesRequest,
    ): Promise<FundingAddressSet>;
  }
>;

function commonFundingActions(client: BaseClient): CommonFundingActions {
  return {
    fetchFundingQuote: fetchFundingQuote.bind(null, client),
    fetchFundingTransactions: fetchFundingTransactions.bind(null, client),
    fetchSupportedFundingAssets: fetchSupportedFundingAssets.bind(null, client),
  };
}

export function fundingActions(client: BasePublicClient): PublicFundingActions;
export function fundingActions(client: BaseSecureClient): SecureFundingActions;
export function fundingActions(
  client: BaseClient,
): PublicFundingActions | SecureFundingActions {
  const actions = commonFundingActions(client);

  if (client.isPublicClient()) {
    return {
      ...actions,
      createDepositAddresses: createDepositAddresses.bind(null, client),
      createWithdrawalAddresses: createWithdrawalAddresses.bind(null, client),
    };
  }

  return {
    ...actions,
    createDepositAddresses: (
      request: SecureCreateDepositAddressesRequest = {},
    ) =>
      createDepositAddresses(client, {
        ...request,
        wallet: client.account.wallet,
      }),
    createWithdrawalAddresses: (
      request: SecureCreateWithdrawalAddressesRequest,
    ) =>
      createWithdrawalAddresses(client, {
        ...request,
        wallet: client.account.wallet,
      }),
  };
}

export {
  CreateDepositAddressesError,
  CreateWithdrawalAddressesError,
  FetchFundingQuoteError,
  FetchFundingTransactionsError,
  FetchSupportedFundingAssetsError,
} from '../actions';
