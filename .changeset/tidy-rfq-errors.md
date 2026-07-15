---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Harden RFQ quoter sessions:

- Unknown error codes no longer fail the session; they flow through as plain strings via the now-open `RfqErrorCode` type (known codes moved to `RfqKnownErrorCode`).
- Unsolicited connection loss now fails in-flight operations and the session iterator with the new `ConnectionLostError`, carrying the close `code` and `reason`.
