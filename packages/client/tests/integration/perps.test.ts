import type { PerpsSession, TxHash } from '@polymarket/client';
import { RequestRejectedError } from '@polymarket/client';
import { describe, expect, it, runMeteredTests } from './fixtures';

const DEFAULT_PERPS_CREDENTIAL_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000;

describe('Perps integration', () => {
  it.runIf(runMeteredTests)(
    'deposits and withdraws the same Perps amount',
    async ({ secureClientWithDepositWallet }) => {
      const approval = await secureClientWithDepositWallet.approveErc20({
        amount: 'max',
        spenderAddress:
          secureClientWithDepositWallet.environment.contracts
            .perpsDepositContract,
        tokenAddress:
          secureClientWithDepositWallet.environment.contracts.collateralToken,
      });
      await approval.wait();

      const deposit = await secureClientWithDepositWallet.depositToPerps({
        amount: 10_000_000n,
      });
      const depositOutcome = await deposit.wait();

      expect(depositOutcome.transactionHash).toMatch(/^0x[0-9a-f]{64}$/i);

      const session = await secureClientWithDepositWallet.openPerpsSession({
        expiresIn: 30 * 60_000,
      });

      try {
        await waitForConfirmedDeposit(
          session,
          depositOutcome.transactionHash,
          '10',
        );

        const withdrawalId =
          await secureClientWithDepositWallet.withdrawFromPerps({
            amount: 10_000_000n,
          });

        expect(withdrawalId).toEqual(expect.any(Number));
      } finally {
        await session.close();
      }
    },
    6 * 60_000,
  );

  it.runIf(runMeteredTests)(
    'creates delegated Perps credentials with the default expiry',
    async ({ secureClientWithDepositWallet }) => {
      const startedAt = Date.now();
      const session = await secureClientWithDepositWallet.openPerpsSession();

      expect(session.credentials.proxy).toMatch(/^0x[0-9a-f]{40}$/i);
      expect(session.credentials.privateKey).toMatch(/^0x[0-9a-f]{64}$/i);
      expect(session.credentials.secret).toEqual(expect.any(String));
      expect(session.credentials.expiresAt).toBeGreaterThanOrEqual(
        startedAt + DEFAULT_PERPS_CREDENTIAL_EXPIRES_IN,
      );
      expect(session.credentials.expiresAt).toBeLessThanOrEqual(
        Date.now() + DEFAULT_PERPS_CREDENTIAL_EXPIRES_IN,
      );

      await session.close();
    },
  );

  it.runIf(runMeteredTests)(
    'resumes existing delegated Perps credentials',
    async ({ secureClientWithDepositWallet }) => {
      const initialSession =
        await secureClientWithDepositWallet.openPerpsSession({
          expiresIn: 30 * 60_000,
        });

      try {
        const resumedSession =
          await secureClientWithDepositWallet.openPerpsSession({
            credentials: initialSession.credentials,
          });

        expect(resumedSession.credentials).toEqual(initialSession.credentials);

        await resumedSession.close();
      } finally {
        await initialSession.close();
      }
    },
  );

  it.runIf(runMeteredTests)(
    'revokes delegated Perps credentials',
    async ({ secureClientWithDepositWallet }) => {
      const session = await secureClientWithDepositWallet.openPerpsSession({
        expiresIn: 30 * 60_000,
      });
      const credentials = session.credentials;

      await session.close();

      await secureClientWithDepositWallet.revokePerpsCredentials({
        proxy: credentials.proxy,
      });

      await expect(
        secureClientWithDepositWallet.openPerpsSession({ credentials }),
      ).rejects.toBeInstanceOf(RequestRejectedError);
    },
  );

  it.runIf(runMeteredTests)(
    'rejects delegated Perps credentials with an invalid secret',
    async ({ secureClientWithDepositWallet }) => {
      const session = await secureClientWithDepositWallet.openPerpsSession({
        expiresIn: 30 * 60_000,
      });

      try {
        await expect(
          secureClientWithDepositWallet.openPerpsSession({
            credentials: {
              ...session.credentials,
              secret: 'invalid-secret',
            },
          }),
        ).rejects.toBeInstanceOf(RequestRejectedError);
      } finally {
        await session.close();
      }
    },
  );
});

async function waitForConfirmedDeposit(
  session: PerpsSession,
  hash: TxHash,
  amount: string,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 5 * 60_000) {
    const page = await session.listDeposits({ hash }).firstPage();
    const deposit = page.items.find((item) => item.hash === hash);

    if (deposit?.status === 'confirmed') {
      expect(deposit.amount).toBe(amount);
      return;
    }

    await delay(5_000);
  }

  throw new Error(`Timed out waiting for Perps deposit ${hash} to confirm`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
