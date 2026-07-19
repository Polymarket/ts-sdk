---
"@polymarket/bindings": patch
---

Remove `RfqKnownInboundMessageSchema`. The loose `{ type }` base was extended and its `type` field overwritten by every concrete inbound message schema, so it added nothing; each message schema now declares its own object shape directly.
