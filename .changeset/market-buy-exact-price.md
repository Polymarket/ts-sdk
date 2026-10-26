---
"@polymarket/client": patch
---

Sign market BUY amounts whose ratio is exactly the order price. The SDK signs the largest whole-cent spend within `amount` whose share count, at the market's share precision, encodes the price exactly, so part of `amount` may go unspent. When no such spend fits, or it falls below the 1 USD marketable BUY minimum, the SDK throws `UserInputError` with the smallest amount that works. Protected BUYs now sign exactly `maxPrice`. Market SELLs and limit orders are unchanged.
