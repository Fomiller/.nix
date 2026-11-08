# pr-organizer

A Claude Code mod that adds a `/prs` pane for organizing your GitHub pull requests.

## What it does

- **Views by state** — My open, Draft, Awaiting review, Approved, Changes requested,
  CI failing, Review requested of me, Recently merged (each with a live count).
- **Grouping by related work** — PRs are grouped by the ticket key found in the title
  or branch name (`TICKETA-1`, `proj-42`, …). You can override that per PR with a
  named group ("Set group…"), or switch to grouping by repo / no grouping. Group
  headers collapse on press. Manual groups persist across sessions.
- **Ask Claude to group** — sends a prompt asking Claude to cluster your PRs by related
  work using the mod's two tools, `mcp__pr-organizer__list_prs` and
  `mcp__pr-organizer__set_pr_group`. You can also just ask Claude in chat
  ("put my billing PRs in one group").
- **Actions on the selected PR** — Ready for review / Convert to draft, Merge (squash,
  delete branch; press twice to confirm), Auto-merge, Update branch, Request review…,
  Close (confirm), Approve (confirm, PRs awaiting your review), Comment…, Set/Clear group,
  and "Ask Claude to review" / "Ask Claude to fix" (changes requested or failing CI).

## Usage

```
/prs                      open the pane (re-fetches if data is >5 min old)
/prs refresh              open and re-fetch now
/prs scope org:acme       limit every search to extra gh qualifiers (persisted)
/prs scope                clear the scope
```

In the pane: `r` refresh, `g` ask Claude to group; with a PR selected `m` merge,
`x` close, `y` ready, `a` approve, `v` request review, `c` comment, `s` set group.
Esc returns to the prompt.

## Requirements

The [`gh`](https://cli.github.com) CLI, authenticated (`gh auth login`). All data comes
from one `gh api graphql` search call; actions are plain `gh pr …` commands.

## Development

`claude plugin validate .`, `claude plugin test .`, and `tsc -p .` once a session has
loaded the mod (it writes the API types to `.claude-plugin/types/`).
