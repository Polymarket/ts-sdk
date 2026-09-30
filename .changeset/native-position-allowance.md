---
'@polymarket/bindings': patch
'@polymarket/client': patch
---

Support `CONDITIONAL-V2` balance and allowance reads and refreshes. Use the native
position selector for both allowance checks and post-approval refreshes when
automatically recovering a Polymarket V2 sell order.
