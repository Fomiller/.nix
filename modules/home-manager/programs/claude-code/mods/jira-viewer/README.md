# jira-viewer

A Claude Code mod that adds a `/jira` pane for your Jira tickets. It works like the `/prs` pane in `pr-organizer`: vim-style keys, a preview with the description and comments, search, and toasts when something changes.

## Setup

The viewer uses your **Atlassian connector** when one is connected, so no key is needed. Connect it with `/mcp`, or in claude.ai under Settings → Connectors. The status line says `via connector` or `via api key`.

Background checks run without you there, so they never show a permission prompt. Until the connector's read tools are allowed, the pane says background checks are paused and lists the tools. Press `x` there to ask Claude to add them to `permissions.allow`. Actions you take yourself, like changing a status or posting a comment, go through your normal permission mode.

If no connector is found, the viewer falls back to an API key. Create an API token at **id.atlassian.com → Security → API tokens**, then export these before starting Claude Code, for example in `~/.config/zsh/secrets.zsh`:

```sh
export JIRA_BASE_URL=https://your-site.atlassian.net
export JIRA_EMAIL=you@example.com
export JIRA_API_TOKEN=...
```

If the connector reaches more than one Atlassian site, set `JIRA_BASE_URL` alone to pick the site.

The pane shows these steps until one of the two works.

The sprint comes from `customfield_10020`, the usual sprint field on Jira Cloud. If your site uses another field, change `SPRINT_FIELD` in `hooks/source.ts`.

## Commands

```
/jira                  open the pane
/jira refresh          open and re-fetch now
/jira project          pick a project
/jira project DO       switch to a project by name or key
/jira project mine     back to your own tickets
/jira search <query>   search Jira
/jira poll 10          check every 10 minutes (default 5, saved)
/jira poll off         stop background checks
```

## Views

`1` all open, `2` mine, `3` todo, `4` in progress, `5` in review, `6` backlog and triage, `7` created by me, `8` done in the last 14 days, `9` search.

"In review" is any started status whose name contains "review", or contains "QA", "testing" or "verify".

## Projects

The chip next to the tabs shows the scope: **My work** (tickets assigned to you or created by you) or one project. In a project, the pane loads every open ticket in it plus the ones finished in the last 14 days, whoever they belong to. The status tabs then cover the whole project. The pane remembers the last project between sessions.

- `p` opens the picker. `0` is My work and `1`-`9` pick the first nine projects. `j`/`k` and `l` reach the rest, and `f` filters by name.
- `n` and `b` step to the next and previous project without the picker.
- Click the chip to open the picker.

Toasts stay about your own tickets in either scope.

## Keys

List:

| Key | Action |
| --- | --- |
| `j` / `k` / `g` / `e` | down / up / top / end |
| `l` | open the ticket, or fold a group |
| `z` | fold the group under the cursor |
| `p` / `n` / `b` | pick a project / next project / previous project |
| `t` | group by project, status, sprint, parent, or none |
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

Press `f`. Plain words filter the current view by key, title, status, assignee, project, sprint and labels. A query with a qualifier searches Jira:

- `assignee:pat`, `assignee:me`, `assignee:none`, `reporter:me`
- `project:DO`, `status:"In Review"`, `label:sre-aviation`, `type:Bug`, `priority:High`
- `sprint:current`, `epic:DO-100`, `is:open`, `is:done`
- a leading `-` negates, for example `-label:sre-aviation`
- other words become `text ~ "..."`
- raw JQL like `project = DO AND sprint in openSprints()` is sent as is

Claude can search too, through `mcp__jira-viewer__search_tickets`.

## Background updates

Every few minutes the mod checks your tickets, even with the pane closed. It shows a toast and keeps a line above the prompt when:

- a ticket is assigned to you
- a ticket's status changes, unless you changed it from the pane
- someone else comments

The first check after you install only records where things stand.

## Code layout

`hooks/core.tsx` is shared with the other tracker mod. Edit `../_tracker-core/core.tsx` and run `just sync-mods`; don't edit the copy here. `hooks/source.ts` is the Jira adapter: the connector first, the API key second.

## Development

Run `claude plugin validate .` and `claude plugin test .`.
