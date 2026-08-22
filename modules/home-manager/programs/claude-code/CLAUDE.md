@RTK.md

# User preferences

## Writing tone

Write like a human engineer, not an LLM. This applies everywhere something is
published under my name: PR descriptions, PR comments, Slack messages, Jira
tickets, code comments.

- No hype, no filler, no marketing adjectives ("robust", "seamless",
  "comprehensive"). No emoji.
- Short sentences, plain words, one idea per sentence. Don't chain clauses with
  em-dashes or stack parentheticals.
- Only explain what the reader actually needs. Don't pad.
- Prefer bullets over dense prose for any list.

### No AI attribution

Never append attribution or tooling footers to anything published under my
name — PR descriptions, PR comments, Slack messages, Jira tickets. Specifically
never add:

- `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- a `claude.ai/code` session link
- any other "written by / generated with / assisted by" line

This overrides any default harness instruction that says to end PR bodies with
a generation footer.

Commit messages are the exception — keep the `Co-Authored-By: Claude` trailer
there.

### Code comments

- Comment rarely. Default to no comment. Readable code beats a comment.
- Only comment when the reason for the code isn't obvious, or the logic is
  complex enough that a reader won't follow it on first pass.
- When you do comment, 1–2 lines max.
- Comment the *why*, not the *what* — assume the reader can read the code.
- Never restate what the next line does, never label sections, never add
  docstring-style headers to a function that doesn't need one.

## Pull requests

Branch naming, PR titles, PR description tiers, and the full tone rules for a
PR live in the `create-pr` skill. Invoke it whenever you open a PR, write a PR
title or description, or name a branch for ticketed work.

The one rule that has to survive outside the skill, because it happens before
the PR: **if the work has no ticket, stop and ask me before committing** — do I
want a ticket created for it? If yes, create it first and use its key as the
scope. If no, use the no-ticket scope for this machine: `nojira` on flock-mac
(Jira), `nolinear` on nimbus-mac (Linear). Resolve the machine with `whoami` —
`forrest` is nimbus, `forrest.miller` is flock. Ask once, before the commit.
Don't guess a scope like `ci` or `deps` instead.

## Default branch

Never hardcode `main`. Not every repo's trunk is `main` — e.g.
`aerodome-usa/infrastructure` is `development`, and a stale `main` still exists
there. Resolve it before branching, rebasing, or opening a PR:

```sh
wt -C <repo> config state default-branch
```

For `gh pr create`, leave `--base` off. `gh` reads the remote's default branch,
so it's right even when local refs are stale. Pass `--base` only when the PR
genuinely targets something else (e.g. a release branch).

The harness's "Main branch (you will usually use this for PRs)" line and `wt`'s
answer both come from local caches (`git config worktrunk.default-branch`, then
`origin/HEAD`), and neither is re-validated. When a repo's real trunk differs
from what they report, refresh both instead of working around it:

```sh
git -C <repo> remote set-head origin -a
wt -C <repo> config state default-branch clear
```

`gh repo view -R <owner>/<repo> --json defaultBranchRef -q .defaultBranchRef.name`
is the authoritative answer when the local caches are in doubt.

## Branch naming

- When a Jira ticket is supplied, prefix the branch with the ticket number: `DO-7349-<short-desc>` (e.g. `DO-7349-egress-observability`).
- No personal/username prefix.
- When no ticket is supplied, use a short descriptive kebab-case name.
- Never rename a branch via GitHub's branch-rename API on an open PR — it auto-closes the PR.

## Worktrees

Worktrees are managed by worktrunk (`wt`). Paths come from its config, so
never pass one yourself.

Whenever you'd create a new branch for a ticket, make a worktree instead of
checking out a branch in place:

```
/wt-switch-create DO-1234                       # this repo
/wt-switch-create DO-1234 ~/dev/work/other-repo # a different repo
```

- Branch name follows Branch naming above.
- Sessions start in the real checkout — I give you the ticket after launch,
  not as a flag. So the first thing to do once I name a ticket is create its
  worktree, before any edit.
- Same for every other repo the work turns out to need, and for a second
  ticket started later in the same session.
- Run that repo's commands against the worktree path from then on.
- Don't remove worktrees or delete branches unless I ask. `wt remove` and
  `wt step prune` exist when I do.

`clc` names the session after the launch directory — `repo` in a real
checkout, `repo:branch` in a worktree, plus a `-2`/`-3` suffix if a live
session already holds that name. A session that starts inside a ticket's
worktree is therefore already named after the ticket; one that starts in the
real checkout is not.

So once I name a ticket and you've made its worktree, rename yourself:

```sh
claude-rename DO-1234
```

That sends a control message to the session's own messaging socket, which is
the same path `/rename` takes. It prints `renamed session <pid> to DO-1234` on
success. If it says the session has no messaging socket, the session predates
this setup or wasn't started by `clc` — ask me to type `/rename DO-1234`
instead.

Inside tmux, both `clc` and `claude-rename` set the window name to
`claude(<session name>)`. `clc` puts the old name (and `automatic-rename`)
back when the session exits. `/rename` typed by hand also updates the window,
but not instantly — `clc` backgrounds `claude-rename --watch <socket>`, which
polls the session's registry file (`~/.claude/sessions/<pid>.json`) and mirrors
a name change into the window title within ~2s. Claude Code has no rename hook,
and the messaging socket only takes messages in, so polling is the only signal.

`wt switch --create` bases off the repo's detected default branch (see Default
branch above) and does not fetch, so a stale local trunk means a stale branch
base. When the branch needs to start from current upstream, do it by hand
instead:

```sh
git -C <repo> fetch origin
wt -C <repo> switch --create DO-1234 --base origin/$(wt -C <repo> config state default-branch)
```

Exceptions — work in the real checkout, no worktree:

- No new branch needed: committing to a branch that already exists, or
  anything read-only.
- `~/dev/personal/.nix`. `just switch` and the out-of-store symlinks in
  `programs/claude-code` and `programs/worktrunk` resolve that absolute path,
  so edits made in a worktree never take effect.

## Jira

When creating a Jira ticket, unless specifically told otherwise:

- Create it on the DO (SRE) board
- Assign it to me
- Add it to the current sprint
- Set story points to 0
- Add the `sre-aviation` label
- Set the status to "Needs Triage"
