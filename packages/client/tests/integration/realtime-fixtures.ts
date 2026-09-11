import { createSecureClient, type SecureClient } from '@polymarket/client';
import { it as base } from './fixtures';

// Price streams only need signer authentication. Using the EOA avoids wallet
// deployment and relayer authorization in these non-trading integration tests.
export const it = base.extend<{ realtimeClient: SecureClient }>({
  realtimeClient: async ({ depositWalletSigner, environment }, use) => {
    const client = await createSecureClient({
      environment,
      signer: depositWalletSigner,
      wallet: await depositWalletSigner.getAddress(),
    });
    try {
      await use(client);
    } finally {
      await client.closeSubscriptions();
    }
  },
});
