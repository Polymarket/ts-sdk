---
"@polymarket/client": patch
---

Automatic pagination now throws `UnexpectedResponseError` when a continuing page carries no cursor or repeats a cursor already requested in that walk, after yielding the pages fetched so far. Previously a missing cursor restarted iteration from the first page and a repeated cursor kept fetching the same page.
