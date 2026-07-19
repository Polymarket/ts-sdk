---
"@polymarket/react": minor
---

Round out the trading-hub hook surface. Reads: `useEvent`, `usePriceHistory`, `useMidpoint`, `useLastTradePrice`, `useSearch` (grouped first-page results), `useTags`, `useRelatedTags`, `useComments`, `usePublicProfile`, `useMarketHolders`, and `useTraderLeaderboard`. Gasless lifecycle writes resolving at transaction confirmation: `useRedeemPositions` (claim winnings), `useSplitPosition`, `useMergePositions`, and `useTransfer` (withdraw).
