---
"@polymarket/bindings": patch
---

Add a required `id` on Perps account funding payment records, matching the unique funding-record id the platform now returns on funding history and the realtime funding stream. The id is exposed as the branded `PerpsFundingPaymentId` type.
