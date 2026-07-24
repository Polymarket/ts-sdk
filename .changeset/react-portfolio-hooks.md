---
"@polymarket/react": minor
---

Add portfolio and account hooks: `usePositions`, `useClosedPositions`, `usePortfolioValue`, and `useActivity` read per-address public data with the `user` defaulting to the session wallet (paused while unauthenticated, explicit `user` works without a session); `useBalance`, `useNotifications`, `useOrder`, and `useTradingRestriction` read session-bound account state; `useDropNotifications` dismisses notifications; `useEstimatedMarketPrice` previews the price level a market order would cross at current book depth.
