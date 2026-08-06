import type {
  DecimalString,
  PerpsInstrument,
  PerpsOrderId,
  PerpsSession,
  TxHash,
} from '@polymarket/client';
import {
  OrderSide,
  PerpsTimeInForce,
  RequestRejectedError,
} from '@polymarket/client';
import { expectNonEmptyArray } from '@polymarket/types';
import { vi } from 'vitest';
import {
  describe,
  expect,
  it,
  publicClient,
  runMeteredTests,
} from './fixtures';

const DEFAULT_PERPS_CREDENTIAL_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000;
const MAX_PERPS_PRICE_SIGNIFICANT_FIGURES = 5;

const [instrument] = await publicClient
  .fetchPerpsInstruments()
  .then(expectNonEmptyArray);
const [ticker] = await publicClient
  .fetchPerpsTickers({ instrumentId: instrument.id })
  .then(expectNonEmptyArray);

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
    'places and cancels one Perps order',
    async ({ secureClientWithDepositWallet }) => {
      const session = await secureClientWithDepositWallet.openPerpsSession();
      const price = formatPerpsPrice(
        Number(ticker.markPrice) / 2, // ensure the order is not immediately filled
        instrument.priceDecimals,
      );

      try {
        const { order } = await session.placeOrder({
          instrumentId: instrument.id,
          price,
          quantity: minimalPerpsOrderQuantity(instrument, Number(price)),
          side: OrderSide.BUY,
          timeInForce: PerpsTimeInForce.GTC,
        });

        const cancelResult = await session.cancelOrder({ orderId: order.id });
        expect(cancelResult.status).toBe('ok');
      } finally {
        await session.close();
      }
    },
    6 * 60_000,
  );

  it.runIf(runMeteredTests)(
    'places and cancels all Perps orders for one instrument',
    async ({ secureClientWithDepositWallet }) => {
      const session = await secureClientWithDepositWallet.openPerpsSession();
      const orderIds: PerpsOrderId[] = [];

      try {
        const price = formatPerpsPrice(
          Number(ticker.markPrice) / 2,
          instrument.priceDecimals,
        );
        const quantity = minimalPerpsOrderQuantity(instrument, Number(price));

        for (let index = 0; index < 2; index++) {
          const { order } = await session.placeOrder({
            instrumentId: instrument.id,
            price,
            quantity,
            side: OrderSide.BUY,
            timeInForce: PerpsTimeInForce.GTC,
          });
          orderIds.push(order.id);
        }

        await session.cancelAllOrders({ instrumentId: instrument.id });
        await vi.waitFor(
          async () => {
            const openOrderIds = (
              await session.fetchOpenOrders({
                instrumentId: instrument.id,
              })
            ).map((order) => order.id);

            for (const orderId of orderIds) {
              expect(openOrderIds).not.toContain(orderId);
            }
          },
          { interval: 1_000, timeout: 30_000 },
        );
      } finally {
        if (orderIds.length > 0) {
          await session.cancelOrders({ orderIds }).catch(() => undefined);
        }
        await session.close();
      }
    },
    6 * 60_000,
  );

  it.runIf(runMeteredTests)(
    'places and cancels one Perps order with TP/SL',
    async ({ secureClientWithDepositWallet }) => {
      const session = await secureClientWithDepositWallet.openPerpsSession();
      const markPrice = Number(ticker.markPrice);
      const price = formatPerpsPrice(
        markPrice / 2, // ensure the order is not immediately filled
        instrument.priceDecimals,
      );

      try {
        const result = await session.placeOrder({
          instrumentId: instrument.id,
          price,
          quantity: minimalPerpsOrderQuantity(instrument, Number(price)),
          side: OrderSide.BUY,
          timeInForce: PerpsTimeInForce.GTC,
          stopLoss: {
            triggerPrice: formatPerpsPrice(
              markPrice / 4,
              instrument.priceDecimals,
            ),
          },
          takeProfit: {
            triggerPrice: formatPerpsPrice(
              markPrice * 2,
              instrument.priceDecimals,
            ),
          },
        });

        expect(result.tpSl.takeProfit?.orderId).toEqual(expect.any(Number));
        expect(result.tpSl.stopLoss?.orderId).toEqual(expect.any(Number));

        const cancelResult = await session.cancelOrder({
          orderId: result.order.id,
        });
        expect(cancelResult.status).toBe('ok');
      } finally {
        await session.close();
      }
    },
    6 * 60_000,
  );

  it.runIf(runMeteredTests)(
    'arms, reads, and disarms the auto-cancel switch',
    async ({ secureClientWithDepositWallet }) => {
      const session = await secureClientWithDepositWallet.openPerpsSession();

      try {
        // Far enough out that the switch can never fire mid-suite.
        const cancelAt = Date.now() + 10 * 60_000;

        try {
          await session.armAutoCancel({ cancelAt });

          const armed = await session.fetchAutoCancelStatus();
          expect(armed.deadline).toBe(cancelAt);
          expect(armed.dailyLimit).toBeGreaterThan(0);
        } finally {
          await session.disarmAutoCancel();
        }

        const disarmed = await session.fetchAutoCancelStatus();
        expect(disarmed.deadline).toBeNull();
      } finally {
        await session.close();
      }
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

function formatPerpsPrice(price: number, priceDecimals: number): DecimalString {
  const roundedPrice = Number(
    price.toPrecision(MAX_PERPS_PRICE_SIGNIFICANT_FIGURES),
  );

  if (Number.isInteger(roundedPrice)) {
    return roundedPrice.toFixed(0) as DecimalString;
  }

  return roundedPrice
    .toFixed(priceDecimals)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '') as DecimalString;
}

function minimalPerpsOrderQuantity(
  instrument: PerpsInstrument,
  price: number,
): DecimalString {
  const quantity =
    Math.ceil(
      (Number(instrument.minNotional) / Number(price)) *
        10 ** instrument.quantityDecimals,
    ) /
    10 ** instrument.quantityDecimals;

  return quantity.toFixed(instrument.quantityDecimals) as DecimalString;
}
