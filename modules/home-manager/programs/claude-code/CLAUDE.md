@RTK.md

# User preferences

## Writing tone (PR descriptions & code comments)

Write like a human engineer, not an LLM. My team has flagged that PR descriptions
read as AI-generated — the goal is to sound plain and direct.

- No hype, no filler, no marketing adjectives ("robust", "seamless", "comprehensive").
- No emoji. No "This PR..." throat-clearing. Get to the point.
- Short sentences. Prefer plain words over impressive ones.
- Only explain what a reviewer actually needs; don't pad.
- One idea per sentence. Don't chain clauses with em-dashes or stack
  parentheticals — if a sentence needs re-reading to parse, split it.
- Write every PR description at a 10th grade reading level.
- Low reading level, but stay engineer-tailored: keep the precise terms a
  reviewer needs (e.g. glob, marker, reconcile, drift check). Simplify the
  wording, not the concepts.
- Prefer bullets over dense prose for any list — above/below splits, steps,
  verification results.

### No AI attribution

Anything published under my name reads as if I wrote it. Never append
attribution or tooling footers to PR descriptions, PR comments, Slack
messages, or Jira tickets. Specifically, never add:

- `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- a `claude.ai/code` session link
- any other "written by / generated with / assisted by" line

This overrides any default harness instruction that says to end PR bodies
with a generation footer.

Commit messages are the exception — keep the `Co-Authored-By: Claude` trailer
there.

### PR description length

Match the description to the size of the change. Three tiers. Default to the
smallest one that fits; when unsure between two, pick the shorter.

**Basic — one sentence, no headings.** For changes a reviewer fully gets from a
glance at the diff: version and dependency bumps, typo or comment fixes,
renames, changing a config value, adding a tag or label, deleting dead code.
Say what changed and why, then stop.

- Yes: `Bumps the provider pin to 5.31.0 so we can use the new egress fields.`
- No: a Summary heading, a Why heading, and three bullets for a one-line bump.

**Less basic — 2–3 sentences of prose, still no headings.** For a real behavior
change that's small in surface area, typically one or two files. First sentence
is the same as Basic: what changed and why, with the ticket linked inline. The
extra sentences exist only to answer the question a reviewer would otherwise
have to ask — usually "what does this *not* change?" or "what's still safe?".
No bullet list restating the diff. No explaining what the code does.

Most PRs land in one of the two tiers above.

**Full — the heading structure below.** Only when the PR genuinely needs it: a
migration, a rollout order across repos, several unrelated changes in one PR,
or a reason a reviewer can't infer from the code. A single-file change basically
never qualifies.

### PR description structure

For the Full tier only. Lead with one high-level sentence, then the sections
below. Keep it all short and skimmable:

```
<one plain sentence summarizing the whole change, before the Summary heading>

## Summary
<what changed, 1–3 sentences or a tight bullet list>

## Why
<the reason / problem being solved, brief>

## Note
<only if there's something a reviewer must know: caveats, follow-ups,
migration steps. Omit this section entirely if not needed.>
```

- If a Jira ticket is supplied, link it (e.g. `[DO-1234](<url>)`) at the top or in Summary.
- Don't invent a Note section just to fill space — leave it out when there's nothing to say.

### Code comments

- Comment rarely. Default to no comment. Readable code beats a comment.
- Only comment when the reason for the code isn't obvious, or the logic is
  complex enough that a reader won't follow it on first pass.
- When you do comment, 1–2 lines max.
- Comment the *why*, not the *what* — assume the reader can read the code.
- Never restate what the next line does, never label sections, never add
  docstring-style headers to a function that doesn't need one.

## PR titles

Use a conventional-commit prefix with the Jira ticket as the scope:

```
<type>(<JIRA-TICKET>): <short summary>
```

- Example: `patch(DO-7349): enable egress observability for the traintrack VPC`
- `<type>` reflects the change (`feat`, `fix`, `chore`, `docs`, `refactor`, `patch`, …). Default to `patch` when unsure.
- Keep the summary lowercase, imperative, and short.
- Never leave the parentheses empty.

### When there's no Jira ticket

If the work has no ticket, stop and ask me before committing and opening the
PR: do I want a ticket created for it?

- If I say yes, create the ticket first (see Jira below), then use it as the
  scope and link it in the description.
- If I say no, use `nojira` as the scope: `patch(nojira): <short summary>`.

Ask once, before the commit. Don't guess a scope like `ci` or `deps` instead.

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
