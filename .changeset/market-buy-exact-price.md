---
"@polymarket/client": patch
---

Sign market BUY amounts whose ratio is exactly the order price. The SDK signs the largest spend within `amount` whose share count encodes the price exactly, with spend and shares both at the market's amount precision, so part of `amount` may go unspent. When no such spend fits, or it falls below the 0.99 USD marketable BUY minimum, the SDK throws `UserInputError` with the smallest amount that works. Protected BUYs now sign exactly `maxPrice`. Market SELLs and limit orders are unchanged.
