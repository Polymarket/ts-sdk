---
"@polymarket/react": minor
---

Add wallet and session authentication: `useAuthentication` with workflow-handler-driven `authenticate()` and `logout()`, serializable `Session` with synchronous `initialSession` restore, the signature-only `WorkflowHandler` contract with cancellation, secure read hooks that pause until authenticated and end the session on 401, `useOpenOrders`, and the `@polymarket/react/viem` entry point with `useWorkflowHandler`.
