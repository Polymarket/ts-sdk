# Contributing

Thanks for your interest in improving the Polymarket TypeScript SDK.

We use GitHub Issues as the primary public feedback channel. Please open an
issue for bug reports, feature requests, or general feedback.

## Before opening a pull request

External pull requests must be discussed and approved in an issue before work
begins. This keeps contributors from spending time on changes that do not fit
the SDK direction and keeps the review queue focused.

1. Open the appropriate issue, or join the discussion on an existing one.
2. Agree on the scope and approach with a maintainer.
3. Wait for a maintainer to assign the issue to you and add the
   `contribution-approved` label.
4. Fork the repository, make the agreed change, and open a pull request that
   includes `Approved issue: #123` in its description.

Pull requests from external contributors without write access are closed
automatically unless the referenced issue has the `contribution-approved` label
and is assigned to the pull request author. Once both conditions are met, a
previously closed pull request can be reopened.

Approval applies only to the scope agreed in the linked issue. It does not
guarantee that a pull request will be merged.

## Pull request expectations

- Keep the change focused on the approved scope.
- Make sure your agent loads the applicable `AGENTS.md` or `CLAUDE.md` file.
- Keep the description concise and specific to the change. If you use AI to
  help write it, review and edit the result carefully, and include only claims
  you have personally verified.
- Include tests when they protect user-facing behavior or prevent a regression.
- Run `pnpm lint` and `pnpm typecheck` before submitting.
- Add a changeset for user-facing package changes.
- Be prepared to revise the change based on review feedback.
