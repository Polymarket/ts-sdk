---
"@polymarket/client": minor
---

Read supported discovery endpoints through the API gateway first. Fall back to the direct service only after connection failures, a bounded response deadline, or HTTP 502/503/504. Other HTTP and response-validation errors remain visible. Add optional platform API key configuration scoped to gateway requests.
