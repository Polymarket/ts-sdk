---
"@polymarket/react": minor
---

Add trading hooks: `usePlaceMarketOrder` and `usePlaceLimitOrder` drive the order posting workflows through the workflow handler with `step` progress state and no automatic allowance recovery — insufficient balance/allowance rejections surface as the typed `InsufficientAllowanceError` for the integrator to handle; `useSetupTradingApprovals` covers account readiness and allowance recovery through the gasless relayer; `useCancelOrder` cancels open orders. Write executions while unauthenticated reject with the new `UnauthenticatedError`.
