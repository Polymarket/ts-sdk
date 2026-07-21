---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Remove the unreleased `QUOTE_VALIDATION_TIMEOUT_INTERNAL` member from `RfqKnownErrorCode`. The gateway now reports quote-validation timeouts as `SERVICE_UNAVAILABLE`; gateways still emitting the internal code during rollout flow through the open `RfqErrorCode` type as plain strings.
