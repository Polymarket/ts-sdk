---
"@polymarket/client": minor
---

Reject comment and search cursors past their supported pagination depth before sending a request. The comments listings serve pages starting at offset 200 at most, while `search` serves up to 100 pages. Following a cursor past either limit now throws the new `PaginationLimitError`, and the pages already returned stay valid. `firstPage()` consistently rejects its promise when cursor validation fails. Page fullness for `listComments` counts top-level comments only, since replies ride along in the same page. The by-address comments limit is a hard stop with no range filters to retrieve the remaining comments.
