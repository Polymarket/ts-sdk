---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

`listComments` pages through a whole thread by server cursor when the read has no `holdersOnly` or `getPositions` and sorts by nothing, `id` or `createdAt`; the first page keeps today's newest-first order. Cursors carry the parent, order and direction they were minted for and are rejected before any request when reused for a different query. Reads with those options or another order stay on offset pages under the existing 200 cap, and cursors saved from earlier versions keep working with the same arguments. Adds `ListCommentsKeysetResponseSchema` to the bindings.
