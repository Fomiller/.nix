# pr-organizer

A Claude Code mod that adds a `/prs` pane for working through your GitHub pull requests with vim-style keys.

## Commands

```
/prs                   open the pane (re-fetches if data is more than 5 min old)
/prs refresh           open and re-fetch now
/prs search <query>    search GitHub, e.g. /prs search repo:acme/api label:bug
/prs author <login>    open PRs by someone else
/prs scope org:acme    limit every search to extra gh qualifiers (saved)
/prs scope             clear the scope
/prs poll 5            check for PR changes every 5 minutes (default 3, saved)
/prs poll off          stop background checks
```

## Keys

The pane takes keys while it has focus. `/prs` focuses it. Otherwise press ctrl+x tab or click it. Esc hands the keys back to the prompt.

List:

| Key | Action |
| --- | --- |
| `j` / `k` | down / up |
| `g` / `e` | top / end |
| `l` | open the PR conversation, or fold a group |
| `z` | fold the group under the cursor |
| `1`-`9` | switch view: open, draft, awaiting review, approved, changes requested, CI failing, to review, merged, search |
| `f` | find (see Search) |
| `u` | clear the search |
| `t` | group by ticket / repo / none |
| `m` | merge an approved PR (press twice) |
| `a` | approve a PR waiting on you (press twice) |
| `o` | open in the browser |
| `i` | ask Claude about the PR |
| `c` | ask Claude to group PRs by related work |
| `r` / `q` | refresh / close |

PR conversation:

| Key | Action |
| --- | --- |
| `h` | back to the list |
| `j` / `k` / `g` | scroll the description, comments, reviews and inline threads |
| `z` | show the whole comment at the top, or shrink it again |
| `n` / `p` | next / previous PR |
| `m` | squash-merge and delete the branch (press twice) |
| `w` | enable auto-merge |
| `x` | close (press twice) |
| `y` | ready for review / back to draft |
| `b` | update branch |
| `a` | approve (press twice) |
| `c` | comment |
| `v` | request reviewers |
| `s` | set group |
| `o` / `i` / `r` / `q` | browser / ask Claude / refresh / close |

The list shows the highlighted PR's status, labels, description and latest comments. The preview sits beside the list when the pane is at least 110 columns wide, and under it otherwise. Descriptions and comments render as Markdown. Inline review threads show the code they are about as a diff.

Colors come from your Claude Code theme, so they work inside tmux without truecolor.

## Search

Press `f` and type:

- Plain words filter the current view. They match the title, repo, branch, author, ticket, group, labels and reviewers. `billing pat` keeps PRs that match both words.
- Anything with a GitHub qualifier runs a GitHub search and shows the results in the Search view (`9`). For example `author:pat`, `author:pat is:merged`, `repo:acme/api label:bug` or `review-requested:sam`.
- In the Search view, everything you type goes to GitHub.

Rows for PRs you did not open show `@author`. Claude can search too, through the `mcp__pr-organizer__search_prs` tool.

## Background updates

The mod checks your PRs every few minutes, even with the pane closed. When something changes it shows a toast and keeps a band above the prompt. Changes it reports:

- one of your PRs is approved, gets changes requested, fails CI, passes CI, or merges
- someone else comments on a PR
- someone requests your review

Press ctrl+x tab to reach the band. Then `o` opens the PR, `m` merges an approved PR (press twice), `d` dismisses the update, and `x` clears all updates.

## Grouping

PRs are grouped by the ticket key in the title or branch (`TICKETA-1`, `proj-42`). Override this per PR with `s`. You can also ask Claude to group them. It uses the mod's `mcp__pr-organizer__list_prs` and `mcp__pr-organizer__set_pr_group` tools. Manual groups are saved between sessions.

## Requirements

The [`gh`](https://cli.github.com) CLI, logged in with `gh auth login`.

## Development

Run `claude plugin validate .` and `claude plugin test .`. Run `tsc -p .` once a session has loaded the mod, which writes the API types to `.claude-plugin/types/`.
