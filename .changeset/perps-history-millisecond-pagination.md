---
'@polymarket/client': patch
'@polymarket/bindings': patch
---

Continue internal-transfer history past full millisecond pages after verifying
that the overlapping interval is complete, without duplicating or skipping rows.

Remove the experimental transferPerpsCollateral write action and its dedicated
request, error, and response types to match the Python SDK. Transfer history remains available.
