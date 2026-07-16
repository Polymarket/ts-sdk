---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Add `RESOLVED_PARTIAL` to `ComboPositionStatus`. The data API emits this terminal status for combo positions that fully resolve at a fractional on-chain payout (e.g. a voided/50-50 leg). Without it, the zod schema rejected the response and combo-positions parsing failed.
