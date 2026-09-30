---
"@polymarket/client": minor
---

Stop automatic comment and search pagination normally at the supported depth, returning the final accessible page with `limitReached: true` when more items may exist. `hasMore` retains that meaning; the flag indicates unknown completeness, not proof of missing rows. Comment pages start at offset 200 at most, while `search` serves up to 100 pages. Explicitly following a cursor past either limit throws the new `PaginationLimitError` before any request, and the pages already returned stay valid. `firstPage()` consistently rejects its promise when cursor validation fails. Page fullness for `listComments` counts top-level comments only, since replies ride along in the same page. The by-address comments limit is a hard stop with no range filters to retrieve the remaining comments.
