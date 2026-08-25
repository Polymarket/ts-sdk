---
"@polymarket/bindings": minor
"@polymarket/client": minor
"@polymarket/types": minor
---

Add scoped Deposit Wallet session-key authorization, active-key fetching, revocation, and ordinary SecureClient support for authorized session signers. Known scopes have enum members, while newer scope strings remain accepted and preserved for forward compatibility. Authorizations default to `ALL` when scopes are omitted.
