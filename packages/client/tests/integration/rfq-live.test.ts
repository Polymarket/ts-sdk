import {
  RfqExecutionStatus,
  RfqKnownErrorCode,
  RfqQuoteRejectedError,
} from '@polymarket/client';
import { describe, expect, it, runMeteredTests } from './fixtures';

const MAX_IN_FLIGHT_QUOTES = 8;
const STALE_RFQ_BUFFER_MS = 50;

describe('RFQ live quoting integration', () => {
  // Metered: an accepted quote can execute a live trade with real funds.
  it.runIf(runMeteredTests)(
    'quotes live RFQ requests until one executes',
    { timeout: 180_000 },
    async ({ secureClientWithDepositWallet, annotate }) => {
      const session = await secureClientWithDepositWallet.openRfqSession();
      const inFlightQuotes = new Set<Promise<void>>();
      let acknowledgedQuoteCount = 0;
      let confirmedExecution = false;

      try {
        for await (const event of session) {
          if (event.type === 'quote_request') {
            const deadlineInMs = event.submissionDeadline - Date.now();

            if (deadlineInMs <= STALE_RFQ_BUFFER_MS) {
              continue;
            }

            if (inFlightQuotes.size >= MAX_IN_FLIGHT_QUOTES) {
              continue;
            }

            const quote: Promise<void> = event
              .quote({ price: 0.1, size: 0.01 })
              .then(() => {
                acknowledgedQuoteCount += 1;

                if (acknowledgedQuoteCount === 1 && !confirmedExecution) {
                  annotate('RFQ quote acknowledged');
                }
              })
              .catch((error) => {
                if (confirmedExecution) {
                  return;
                }

                if (
                  error instanceof RfqQuoteRejectedError &&
                  (error.code === RfqKnownErrorCode.SubmissionWindowClosed ||
                    error.code === RfqKnownErrorCode.UnknownRfq)
                ) {
                  return;
                }

                annotate(`RFQ quote failed: ${event.rfqId}`);
                void session.close();
                throw error;
              })
              .finally(() => {
                inFlightQuotes.delete(quote);
              });

            // Mark the detached quote promise as handled until the test awaits
            // all in-flight quotes, avoiding early unhandled rejection noise.
            void quote.catch(() => undefined);
            inFlightQuotes.add(quote);
            continue;
          }

          if (
            event.type === 'execution_update' &&
            event.status === RfqExecutionStatus.Confirmed
          ) {
            expect(event.txHash).toBeDefined();
            confirmedExecution = true;
            annotate(`Confirmed RFQ: ${event.rfqId}`);
            void session.close();
            return;
          }
        }

        await Promise.all(inFlightQuotes);
        throw new Error(
          `RFQ session ended without a confirmed execution. Acknowledged quote count: ${acknowledgedQuoteCount}.`,
        );
      } finally {
        await secureClientWithDepositWallet.closeSubscriptions();
      }
    },
  );
});
