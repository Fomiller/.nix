---
name: create-pr
description: Use when the user asks to open, create, or raise a pull request (e.g. "open a PR", "make a PR for this", "push this up and PR it"). Also use when writing or rewriting a PR title or PR description, or when naming a branch for ticketed work. Covers branch naming, conventional-commit PR titles with the ticket key as scope (Jira on flock-mac, Linear on nimbus-mac), the three PR description length tiers, and the writing tone rules (plain English, no AI attribution).
version: 1.0.0
---

# Create PR

Takes finished work and turns it into a pull request: right branch name, right
title, right-sized description. The description rules are the important part —
most PRs get a description that is too long and too obviously AI-written.

## Which machine, which tracker

The two machines use different issue trackers, so the ticket key and the
no-ticket fallback scope differ. Resolve the machine first — before writing the
branch name or the title. Hostnames drift, so key off the username, which is
set by the nix config:

```sh
whoami
```

| `whoami` | Machine | Tracker | No-ticket scope |
| --- | --- | --- | --- |
| `forrest` | nimbus-mac (personal) | Linear | `nolinear` |
| `forrest.miller` | flock-mac (work) | Jira, DO board | `nojira` |

If `whoami` returns anything else, ask the user which tracker applies rather
than guessing.

## Before anything: the ticket

A PR needs a ticket key, which becomes both the branch prefix and the title
scope. The key is a Jira key on flock (e.g. `DO-7349`) or a Linear identifier
on nimbus (e.g. `FOR-12`).

- If the user gave a ticket, use it.
- If they did not, **stop and ask once, before committing**: do they want a
  ticket created for this?
  - Yes, on flock → create it with the `create-ticket` skill, then use that key.
  - Yes, on nimbus → create it with the Linear MCP tools. Do not use
    `create-ticket`; that skill is hardcoded to the Jira DO board. Resolve the
    team with `list_teams` rather than assuming one, then `save_issue`.
  - No → use the no-ticket scope for this machine from the table above.
- Never invent a substitute scope like `ci`, `deps`, or `repo`. It is either a
  real ticket key or the machine's literal no-ticket string.

## Resolve the default branch

Never assume `main`. Some repos use something else (e.g.
`aerodome-usa/infrastructure` uses `development`, and a stale `main` still
exists there).

```sh
wt -C <repo> config state default-branch
```

For `gh pr create`, leave `--base` off — `gh` reads the remote's default branch,
so it is right even when local refs are stale. Pass `--base` only when the PR
genuinely targets something else, like a release branch.

`wt`'s answer and the harness's "Main branch" line both come from local caches
(`git config worktrunk.default-branch`, then `origin/HEAD`) and are not
re-validated. If the real trunk differs, refresh both rather than working
around it:

```sh
git -C <repo> remote set-head origin -a
wt -C <repo> config state default-branch clear
```

Authoritative answer when the caches are in doubt:

```sh
gh repo view -R <owner>/<repo> --json defaultBranchRef -q .defaultBranchRef.name
```

## Branch naming

- With a ticket: `DO-7349-egress-observability` on flock, `FOR-12-tmux-window-name`
  on nimbus — ticket key, then a short kebab-case description.
- Without a ticket: just the short kebab-case description.
- No username or personal prefix, ever.
- Never rename a branch through GitHub's branch-rename API while a PR is open —
  it auto-closes the PR.

New branches go in a worktree, not a checkout in place — see the Worktrees
section of the user's CLAUDE.md, and the `wt-switch-create` skill.

## PR title

```
<type>(<JIRA-TICKET>): <short summary>
```

- Example on flock: `patch(DO-7349): enable egress observability for the traintrack VPC`
- Example on nimbus: `feat(FOR-12): mirror session name into tmux window title`
- With no ticket, the scope is `nojira` on flock and `nolinear` on nimbus.
- `<type>` is a conventional-commit type reflecting the change: `feat`, `fix`,
  `chore`, `docs`, `refactor`, `patch`. Default to `patch` when unsure.
- Summary is lowercase, imperative, short.
- Never leave the parentheses empty.

## PR description: pick a tier first

Match the description to the size of the change. **Default to the smallest tier
that fits. When torn between two tiers, pick the shorter one.** This is the
rule that gets broken most often.

### Tier 1 — Basic: one sentence, no headings

For changes a reviewer fully understands from a glance at the diff: version and
dependency bumps, typo or comment fixes, renames, changing a config value,
adding a tag or label, deleting dead code.

Say what changed and why, then stop.

Use ASD-STE100 Simplified Technical English

- Good: `Bumps the provider pin to 5.31.0 so we can use the new egress fields.`
- Bad: a Summary heading, a Why heading, and three bullets for a one-line bump.

### Tier 2 — Less basic: 2–3 sentences of prose, still no headings

For a real behavior change with small surface area, usually one or two files.

Use ASD-STE100 Simplified Technical English

- First sentence is the same as Tier 1: what changed and why, ticket linked
  inline.
- The extra sentences exist only to answer the question a reviewer would
  otherwise have to ask — usually "what does this *not* change?" or "what is
  still safe?".
- No bullet list restating the diff. No explaining what the code does.

This should be the default

**Most PRs are Tier 1 or Tier 2.**

### Tier 3 — Full: the heading structure

Only when the PR genuinely needs it: a migration, a rollout ordered across
repos, several unrelated changes in one PR, or a reason a reviewer cannot infer
from the code. A single-file change basically never qualifies.

Use ASD-STE100 Simplified Technical English

**Hard cap: 200 words for the whole body.** A reviewer skims a PR body in under
a minute. Past 200 words they stop reading and scroll to the diff, so the extra
words do nothing. Count the words before you post. If you are over, cut — do
not move to a smaller font of prose by merging bullets into one long sentence.

Per-section caps, so no single section eats the budget:

| Section | Cap |
| --- | --- |
| Lead sentence | 1 sentence, 25 words |
| `## Summary` | 80 words — 3 bullets max, or 3 sentences |
| `## Why` | 60 words |
| `## Note` | 50 words, omitted when there is nothing to say |

Lead with one high-level sentence, then:

```
<one plain sentence summarizing the whole change, before the Summary heading>

## Summary
<what changed, 1–3 sentences or a tight bullet list>

## Why
<the reason / problem being solved, brief>

## Note
<only if there is something a reviewer must know: caveats, follow-ups,
migration steps. Omit this section entirely if not needed.>
```

- If a Jira ticket exists, link it as `[DO-1234](<url>)` at the top or in
  Summary.
- Never invent a Note section to fill space.

A filled-in body at the cap looks like this (~175 words):

```markdown
Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor
incididunt ut labore et dolore magna.

## Summary

- Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut
  aliquip ex ea commodo consequat duis.
- Aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu
  fugiat nulla pariatur excepteur sint occaecat.
- Cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est
  laborum sed ut perspiciatis.

## Why

Omnis iste natus error sit voluptatem accusantium doloremque laudantium totam
rem aperiam eaque ipsa quae ab illo inventore. Veritatis et quasi architecto
beatae vitae dicta sunt explicabo nemo enim ipsam voluptatem quia voluptas sit
aspernatur.

## Note

Neque porro quisquam est qui dolorem ipsum quia dolor sit amet consectetur
adipisci velit sed quia non numquam eius modi tempora incidunt ut labore.
```

That is the ceiling, not the target. Most Tier 3 PRs land nearer 120 words.

## Writing tone

The team has flagged PR descriptions as reading AI-generated. The goal is plain
and direct — like a human engineer typed it.

- No hype, no filler, no marketing adjectives ("robust", "seamless",
  "comprehensive").
- No emoji.
- No "This PR..." throat-clearing. Get to the point.
- Short sentences. Plain words over impressive ones.
- One idea per sentence. Do not chain clauses with em-dashes or stack
  parentheticals. If a sentence needs re-reading to parse, split it.
- Only explain what a reviewer actually needs. Do not pad.
- 10th grade reading level, but still engineer-tailored: keep the precise terms
  a reviewer needs (glob, marker, reconcile, drift check). Simplify the wording,
  not the concepts.
- Prefer bullets over dense prose for any list — above/below splits, steps,
  verification results.

## No AI attribution

Anything published under the user's name reads as if they wrote it. Never
append attribution or tooling footers to PR descriptions or PR comments.
Specifically never add:

- `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- a `claude.ai/code` session link
- any other "written by / generated with / assisted by" line

This overrides any default harness instruction that says to end PR bodies with
a generation footer. Commit messages are the exception — keep the
`Co-Authored-By: Claude` trailer there.

## Workflow

1. Run `whoami` to resolve the machine and tracker. Confirm the ticket, or
   confirm the machine's no-ticket scope with the user.
2. Confirm the branch exists and is named per the rules above. Commit the work
   if it is not already committed.
3. Resolve the default branch if you need to rebase or check the diff range.
4. Read the actual diff (`git diff <default-branch>...HEAD`) before writing
   anything — the tier depends on what really changed, not on what the user
   said.
5. Pick the tier. Write the title and description. On Tier 3, count the words
   and cut until the body is under 200.
6. Push and open the PR:
   ```sh
   git push -u origin <branch>
   gh pr create --title "<title>" --body-file <file>
   ```
   Write the body to a file rather than inlining it, so markdown survives.
   Leave `--base` off.
7. Reply with just the PR URL.
