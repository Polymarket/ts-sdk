---
"@polymarket/client": minor
---

Stop `listComments` and `listCommentsByUserAddress` minting a cursor the service rejects. The comments listings serve pages starting at offset 200 at most; following a cursor past that point now throws the new `PaginationLimitError` before any request is sent, and the pages already returned stay valid. Page fullness for `listComments` counts top-level comments only, since replies ride along in the same page.
