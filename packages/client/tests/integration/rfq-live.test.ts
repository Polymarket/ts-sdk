import {
  RfqErrorCode,
  RfqExecutionStatus,
  RfqQuoteRejectedError,
} from '@polymarket/client';
import { describe, expect, it, runMeteredTests } from './fixtures';

describe.skip('RFQ live quoting integration', () => {
  // Metered: an accepted quote can execute a live trade with real funds.
  it.runIf(runMeteredTests)(
    'quotes live RFQ requests until one executes',
    { timeout: 180_000 },
    async ({ secureClientWithDepositWallet, annotate }) => {
      const session = await secureClientWithDepositWallet.openRfqSession();

      try {
        for await (const event of session) {
          if (event.type === 'quote_request') {
            try {
              await event.quote({ price: 0.5, size: 0.01 });
              annotate(`Quoted RFQ: ${event.rfqId}`);
            } catch (error) {
              if (
                error instanceof RfqQuoteRejectedError &&
                error.code === RfqErrorCode.SubmissionWindowClosed
              ) {
                annotate(
                  `Skipped RFQ after submission window closed: ${event.rfqId}`,
                );
                continue;
              }

              throw error;
            }
            continue;
          }

          if (
            event.type === 'execution_update' &&
            event.status === RfqExecutionStatus.Confirmed
          ) {
            expect(event.txHash).toBeDefined();
            await session.close();
            return;
          }
        }

        throw new Error('RFQ session ended without a confirmed execution.');
      } finally {
        await secureClientWithDepositWallet.closeSubscriptions();
      }
    },
  );
});
