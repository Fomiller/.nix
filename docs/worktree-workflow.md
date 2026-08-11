# Worktree workflow

Every branch gets its own git worktree, created by [worktrunk](https://worktrunk.dev)
(`wt`), and Claude Code creates it for you when you name a ticket. Worktrees for
all repos live under one directory instead of piling up as siblings of each
checkout.

Three things to install: the `wt` binary, the Claude Code plugin that adds
`/wt-switch-create`, and a one-line config. Then a block for your CLAUDE.md.

## 1. Install `wt`

```sh
brew install worktrunk && wt config shell install
```

Or with cargo:

```sh
cargo install worktrunk && wt config shell install
```

`wt config shell install` is not optional. Without the shell hook, `wt` can't
change your shell's directory, so `wt switch` appears to do nothing.

## 2. Install the Claude Code plugin

This is what gives you the `/wt-switch-create` slash command.

```
/plugin marketplace add max-sixty/worktrunk
/plugin install worktrunk@worktrunk
```

## 3. Central worktree path

Default layout is `../<repo>.<branch>` — a sibling of the repo. Put them all in
one place instead. In `~/.config/worktrunk/config.toml`:

```toml
worktree-path = "~/dev/worktrees/{{ repo }}/{{ branch | sanitize }}"
```

## 4. CLAUDE.md block

Add this to `~/.claude/CLAUDE.md`. Swap `DO` for your own Jira project key and
`~/dev/work` for wherever you keep checkouts.

````md
## Default branch

Never hardcode `main`. Not every repo's trunk is `main` (e.g.
`aerodome-usa/infrastructure` is `development`, and a stale `main` still
exists there). Resolve it before branching, rebasing, or opening a PR:

```sh
wt -C <repo> config state default-branch
```

For `gh pr create`, leave `--base` off. `gh` reads the remote's default
branch, so it's right even when local refs are stale. Pass `--base` only when
the PR genuinely targets something else (e.g. a release branch).

The harness's "Main branch (you will usually use this for PRs)" line and
`wt`'s answer both come from local caches (`git config
worktrunk.default-branch`, then `origin/HEAD`), and neither is re-validated.
When a repo's real trunk differs from what they report, refresh both instead
of working around it:

```sh
git -C <repo> remote set-head origin -a
wt -C <repo> config state default-branch clear
```

## Branch naming

- When a Jira ticket is supplied, prefix the branch with the ticket number:
  `DO-7349-<short-desc>`.
- No personal/username prefix.
- No ticket supplied: short descriptive kebab-case name.
- Never rename a branch via GitHub's branch-rename API on an open PR — it
  auto-closes the PR.

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
- Any repo whose tooling resolves absolute paths back to the real checkout
  (e.g. a nix/home-manager config using out-of-store symlinks) — edits made
  in a worktree never take effect there.
````

## Gotchas

- Forgetting `wt config shell install` is the most common failure. Directory
  changes silently don't stick.
- That last exception matters. If a repo's build or activation hardcodes the
  checkout's absolute path, work in the real checkout — a worktree copy builds
  but changes nothing.
- `wt switch --create` bases off the *detected* default branch with no fetch,
  and that detection is cached in `git config worktrunk.default-branch` /
  `origin/HEAD`. A repo whose trunk isn't `main` (or was renamed) will keep
  branching off the wrong base until you run `git remote set-head origin -a`
  and `wt config state default-branch clear`.
