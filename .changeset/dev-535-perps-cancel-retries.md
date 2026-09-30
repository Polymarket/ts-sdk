---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Type known Perps cancellation rejections while preserving unrecognized identifiers, and retry transient `order_in_flight` results with configurable bounded backoff.

When a later cancellation attempt fails, throw `PerpsCancelRetryError` with the last received results in original request order, the pending request indexes, and the underlying cause. Earlier confirmed outcomes remain available; pending entries describe the previous attempt and must be reconciled if the retry's response was lost. Initial-attempt failures keep their existing error types.
