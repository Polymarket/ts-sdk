declare namespace NodeJS {
  interface ProcessEnv {
    CI: string | undefined;
    POLYMARKET_RUN_METERED_TESTS: string | undefined;
    POLYMARKET_DEPOSIT_WALLET: string | undefined;
    POLYMARKET_PRIVATE_KEY: string | undefined;
    POLYMARKET_PROXY_PRIVATE_KEY: string | undefined;
    POLYMARKET_PROXY_WALLET: string | undefined;
    POLYMARKET_SAFE_PRIVATE_KEY: string | undefined;
    POLYMARKET_SAFE_WALLET: string | undefined;
    OPENFORT_TEST_SECRET_KEY: string | undefined;
    OPENFORT_TEST_WALLET_SECRET: string | undefined;
    OPENFORT_TEST_ACCOUNT_ID: string | undefined;
    PRIVY_TEST_APP_ID: string | undefined;
    PRIVY_TEST_APP_SECRET: string | undefined;
    PRIVY_TEST_WALLET_ID: string | undefined;
    POLYMARKET_BUILDER_API_KEY: string | undefined;
    POLYMARKET_BUILDER_SECRET: string | undefined;
    POLYMARKET_BUILDER_PASSPHRASE: string | undefined;
    POLYMARKET_RELAYER_API_KEY: string | undefined;
    POLYMARKET_RELAYER_API_KEY_ADDRESS: string | undefined;
  }
}
