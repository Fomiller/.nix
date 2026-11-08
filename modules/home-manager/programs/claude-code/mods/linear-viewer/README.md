# linear-viewer

A Claude Code mod that adds a `/linear` pane for your Linear tickets. It works like the `/prs` pane in `pr-organizer`: vim-style keys, a preview with the description and comments, search, and toasts when something changes.

## Setup

Create a personal API key in Linear under **Settings → Security & access → Personal API keys**. Export it before starting Claude Code, for example in `~/.config/zsh/secrets.zsh`:

```sh
export LINEAR_API_KEY=lin_api_...
```

The pane shows these steps itself until the variables are set.

## Commands

```
/linear                  open the pane
/linear refresh          open and re-fetch now
/linear search <query>   search Linear
/linear poll 10          check every 10 minutes (default 5, saved)
/linear poll off         stop background checks
```

## Views

`1` mine (assigned, not done), `2` todo, `3` in progress, `4` in review, `5` backlog and triage, `6` created by me, `7` done in the last 14 days, `8` search.

"In review" is any started status whose name contains "review".

## Keys

List:

| Key | Action |
| --- | --- |
| `j` / `k` / `g` / `e` | down / up / top / end |
| `l` | open the ticket, or fold a group |
| `z` | fold the group under the cursor |
| `t` | group by project, status, cycle, parent, or none |
| `f` / `u` | find / clear the search |
| `s` | change status |
| `w` | ask Claude to start work (it sets up the worktree) |
| `y` | copy the ticket key |
| `o` / `r` / `q` | browser / refresh / close |

Ticket:

| Key | Action |
| --- | --- |
| `h` | back |
| `j` / `k` / `g` | scroll the description and comments |
| `z` | show the whole comment at the top |
| `n` / `p` | next / previous ticket |
| `s` | change status, then `1`-`9` to pick |
| `c` | comment |
| `a` | assign to me (press twice) |
| `w` / `i` | start work / ask Claude about it |
| `y` / `o` / `r` / `q` | copy key / browser / refresh / close |

## Search

Press `f`. Plain words filter the current view by key, title, status, assignee, project, cycle and labels. A query with a qualifier searches Linear:

- `assignee:pat`, `assignee:me`, `assignee:none`, `creator:me`
- `team:FOM`, `project:blog`, `label:bug`, `status:"In Review"`
- `is:open`, `is:done`, `priority:high`, `cycle:current`
- a leading `-` negates, for example `-label:bug`
- other words match the title and description

Claude can search too, through `mcp__linear-viewer__search_tickets`.

## Background updates

Every few minutes the mod checks your tickets, even with the pane closed. It shows a toast and keeps a line above the prompt when:

- a ticket is assigned to you
- a ticket's status changes, unless you changed it from the pane
- someone else comments

The first check after you install only records where things stand.

## Code layout

`hooks/core.tsx` is shared with the other tracker mod. Edit `../_tracker-core/core.tsx` and run `just sync-mods`; don't edit the copy here. `hooks/source.ts` is the Linear API adapter.

## Development

Run `claude plugin validate .` and `claude plugin test .`.
