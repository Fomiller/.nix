---
name: daily-summary
description: Use when the user asks to create, write, or fill out their daily work summary / engineering journal / end-of-day log. Gathers the day's PRs (with their intent), Jira ticket movement, and docs, then creates a NEW Confluence page in Forrest's personal space written as an in-depth engineering journal in the user's voice.
version: 2.3.0
---

# Daily summary (engineering journal)

A daily engineering journal the user (Forrest Miller, SRE on Aviation) keeps. **This is deliberately
more in-depth than the weekly `this-week-last-week` skill** — not terse bullets. It's a narrative log
that explains, for each thing worked on, *what* it is and *why / how* it was done, and tracks work by
lifecycle: what was **created**, what's **in progress**, what **needs review**, and what was **closed**
— plus brief summaries of any docs written. Think "future-me (or a teammate) should understand what
happened today and the reasoning behind it," not "status ticker."

## Fixed facts (reuse these — don't rediscover them)

- **Confluence site / cloudId:** `flocksafety.atlassian.net`
- **Destination:** Forrest's **personal space** "Forrest Miller" — `spaceId = 3644915744`,
  key `~7120200725a807b20140658eb4f690af9ca046`, homepage id `3644916344`.
- **Layout (nested, for organization as summaries grow):**
  `Daily Summary` (root) → `<Month YYYY>` (e.g. `July 2026`) → `M/DD Daily Summary` (the day's page).
  - **Daily Summary root page id = `4906582100`** (child of the homepage). Resolve by id; if it 404s,
    find by title (`space = "~7120..." AND title = "Daily Summary"`) or recreate it under the homepage.
  - The month page (title = full month + year, e.g. `July 2026`) is a child of the root. Resolve it by
    title under the root each run; **create it if it doesn't exist yet** (new month = new page).
  - The daily page is a child of that month page.
- **Page title format:** `M/DD Daily Summary` (today's date, no zero-padded month; e.g. `7/02 Daily Summary`).
- **Jira project:** `DO` (SRE board 96). Work is tagged with the `sre-aviation` label.
- **Forrest's Jira accountId:** `712020:0725a807-b201-4065-8eb4-f690af9ca046`
- **GitHub:** PRs span many repos — `aerodome-usa/infrastructure`, `aerodome-usa/platform`,
  `flocksafety/flock-terraform`, `flocksafety/flock-github-actions`, and the `flocksafety/flock-aviation-*`
  service templates. Always search **all** repos, not just the current one.
- **Infrastructure repo (commits, not PRs):** the `infrastructure` repo is GitOps and a lot of work lands
  as **direct commits** with no PR, so PR search alone undercounts it. Local checkout:
  `/Users/forrest.miller/dev/aerodome/infrastructure`. Forrest's commits are authored as **`Forrest Miller`**
  (both `forrestmillerj@gmail.com` case variants) — filter on that name. **Automated `promote <sha> to <branch>`
  commits are authored by `Kargo <no-reply@kargo.io>`**, so filtering by author excludes them automatically;
  if any slip in, drop them — they're deploy plumbing, not work done.
- **Direct commits across all other repos (no local checkout):** the same PR-undercounts-direct-pushes
  problem exists everywhere, not just infrastructure. Forrest's GitHub login is **`Fomiller`** — his
  personal account. **Exclude his personal repos** (anything owned by `github.com/Fomiller`) by scanning
  only the work orgs: `gh search commits --author=Fomiller --owner=aerodome-usa --owner=flocksafety
  --author-date=">=<today>" --json repository,sha,commit,author -L 100`. This surfaces direct-push activity
  in repos with no local checkout (`platform`, `flock-terraform`, `flock-github-actions`, `flock-aviation-*`,
  etc.) without having to enumerate every repo by name. **De-dupe against the PR search**: squash/merge
  commits carry `(#NN)` in the message matching a PR already found there — skip those, they're already
  covered under that PR's entry. What's left are genuine direct pushes, sometimes bypassing branch
  protection/required checks (GitHub reports this on push, e.g. "Bypassed rule violations") — call that out
  explicitly, it's notable for an SRE journal, not routine.

## Section semantics

One dated journal, organized by lifecycle, `## Notes` always last. Skip any section with nothing in it.

- **`## Created`** — new PRs opened today, new repos / AWS / infra resources stood up, new Jira tickets
  filed. For each: what it is **and the why/how** (what problem it addresses, the approach taken).
- **`## In progress`** — what's actively being worked on. State the *why* (problem/goal) and the *how*
  (current approach, design choices, what's done vs. remaining). This is the meatiest section.
- **`## Needs review`** — open PRs awaiting merge and Jira tickets in the **"In Review"** column. For
  each, say what it changes and what a reviewer should focus on / any risk.
- **`## Closed`** — PRs **merged today**, **direct commits pushed to any repo today** (infrastructure or
  otherwise, which land immediately with no PR — flag any that bypassed branch protection/required checks),
  and Jira tickets moved to **Done/resolved today**. Note what landed and its effect (what's now true that
  wasn't this morning). Group related commits into one summary entry.
- **`## Docs`** — Confluence pages written/edited today, each with a 1–2 sentence summary of what it
  covers and why it was written. Link the page.
- **`## Notes`** (last) — where **every note the user asks to include goes** (blockers, PTO, caveats,
  callouts). A bullet under this heading, never inline. Empty `* ` stub if none.

**Always CREATE A NEW PAGE — one per weekday. Never overwrite a previous day's page.** Weekdays only
(Mon–Fri) get a page; weekends are skipped entirely and don't count as gaps. **Never leave a Mon–Fri
gap in the journal** — see "Backfilling gaps" below, which runs automatically every time this skill
fires, independent of whatever date(s) the user explicitly asked for.

## Backfilling gaps

Every run — whether triggered as "write today's summary" or for an explicit past date — first checks
whether the journal has holes and fills them before doing anything else:

1. Find the **latest existing daily page** (across this month and, if needed, the previous one) and
   read its date off the title.
2. Walk forward one calendar day at a time from that date to the **earliest target date** for this run
   (today, by default, or the earliest date the user explicitly named). For every **weekday** (Mon–Fri)
   in that span that does **not** already have a page — i.e. strictly between the latest existing page
   and the target date, exclusive of the target date itself, which the Workflow below will create
   normally — treat it as a **backfill date**.
3. Process backfill dates **oldest first**, running the full Workflow below (steps 2–5: compute title →
   gather → compose → create) for each one, scoped to that specific date rather than "today" (see the
   date-scoping note at the top of Workflow step 3). Skip Saturdays/Sundays — they never get a page and
   never count as a gap.
4. If a backfill date turns up **zero** activity across Jira/PRs/commits/docs (a real day off, or the
   skill simply wasn't run and nothing happened to land that day), still create its page — don't skip
   it — with the lifecycle sections empty and a single line under `## Notes`: `* No tracked activity
   found for this day.` A missing page and a documented no-activity day look identical from outside the
   journal, but only one of them is actually a gap.
5. Once every backfill date has a page, run the Workflow below for the actual requested target date(s)
   (today, or whatever the user named — e.g. "the daily summary for 7/20 and 7/21" runs the full
   sequence once per named date, in order).

## Workflow

1. **Resolve the month parent + read the latest daily page.**
   - The **Daily Summary root** is page `4906582100` (under the homepage). Confirm it exists.
   - Find this run's **month page** under the root — title = `<Month YYYY>` (e.g. `July 2026`). Query
     `searchConfluenceUsingCql` with `space = "~7120200725a807b20140658eb4f690af9ca046" AND title = "<Month YYYY>"`,
     or list the root's children. **If the month page doesn't exist, create it** with `createConfluencePage`
     (`spaceId 3644915744`, `parentId 4906582100`, a one-line intro body). Its id is the daily page's `parentId`.
     A backfill date that crosses into a new month needs its own month-page lookup/creation the same way.
   - Read the latest `... Daily Summary` page (in this month, or last month if it's the 1st) with
     `getConfluencePage` (`contentFormat: markdown`) to match format and avoid repeating yesterday's
     in-progress prose verbatim, **and** to run the gap check above.

2. **Compute the target date's title** `M/DD Daily Summary` (today's date by default, or the date being
   backfilled / explicitly named).

3. **Gather the target date's work — get enough detail to explain why/how, not just titles.** The
   queries below are written for "today" (the common case); when the target date is a backfill date or
   an explicitly-named past date, substitute that date's own 00:00–24:00 local window everywhere
   `startOfDay()` / `>=<today>` appears below — e.g. JQL `updated >= "2026-07-20 00:00" AND updated <
   "2026-07-21 00:00"`, `git log --since="2026-07-20 00:00" --until="2026-07-21 00:00"`, `gh search prs
   --created "2026-07-20..2026-07-20"`, `gh search commits --author-date="2026-07-20..2026-07-20"`, and
   the Confluence `lastmodified` range accordingly:
   - **Jira** (`searchJiraIssuesUsingJql`), fields:
     `summary, status, issuetype, created, updated, resolution, resolutiondate, description, labels`.
     Run **two** queries so nothing is missed:
     - *Tickets I touched today* — `assignee = "712020:0725a807-b201-4065-8eb4-f690af9ca046" AND updated >= startOfDay() ORDER BY updated DESC`.
     - *Tickets I filed today* — `(reporter = "712020:0725a807-b201-4065-8eb4-f690af9ca046" OR creator = "712020:0725a807-b201-4065-8eb4-f690af9ca046") AND created >= startOfDay() ORDER BY created DESC`.
       (The assignee query misses anything filed today but assigned to someone else — this catches it.)
     Bucket: **Created** = *every* ticket created today (list all of them here, even if already advanced —
     note current status + cross-link to its lifecycle section); **In progress** (status "In Progress"),
     **Needs review** (status "In Review"), **Closed** (resolved today / moved to Done). Use the
     description to explain the *why*.
   - **PRs across all repos** — find them:
     `gh search prs --author "@me" --created ">=<today>" --json number,title,state,url,repository` and
     `gh search prs --author "@me" --merged ">=<today>" --json number,title,state,url,repository`.
     Then **read each PR to understand intent**: `gh pr view <url> --json title,body,state,url,additions,deletions,changedFiles,mergedAt,isDraft`.
     Summarize from the body/diff what the PR *does* and *why/how* (don't just restate the title).
     Bucket: merged today → **Closed**; open & ready → **Needs review**; open & draft/WIP → **In progress**;
     opened today → also note under **Created**.
   - **Infrastructure repo commits today** — direct commits are the truest record of infra work, since
     PRs are often skipped here. Gather them from the local checkout:
     `git -C /Users/forrest.miller/dev/aerodome/infrastructure log --all --author="Forrest Miller" --since="00:00" --date=local --stat`
     (`--all` catches commits on any branch — `development`/`staging`/`production`; the author filter drops
     Kargo promote commits). For the ones whose intent isn't clear from the subject, look at the diff
     (`git -C <repo> show --stat <sha>`, or `git show <sha>` for the actual change) so you can explain the
     why/how. **Do NOT list every commit** — group related commits into one entry and summarize the change
     (e.g. "bumped agency-syncer to 1.6.0 and wired its external secrets"), calling out anything notable
     (new resources, version bumps, security remediations, risky/prod-touching changes). Bucket committed
     work as **landed today → Closed** (or **Created** if it stood up a new resource/repo); if a series of
     commits is clearly mid-effort, note it under **In progress** instead. De-dupe against anything already
     covered by a PR entry.
   - **Direct commits across all other repos today** — the same undercount risk applies everywhere, not
     just infrastructure, and there's no local checkout to `git log` for these. Run:
     `gh search commits --author=Fomiller --owner=aerodome-usa --owner=flocksafety --author-date=">=<today>" --json repository,sha,commit,author -L 100`
     (only work-org owners are specified, which naturally excludes any personal repo under `github.com/Fomiller`).
     For each commit returned, check whether its message contains `(#NN)` matching a PR number already
     surfaced by the PR search for that repo — **skip it** if so, it's already covered under that PR's entry.
     For what's left (genuine direct pushes), use `gh api repos/<owner>/<repo>/commits/<sha>` to see the
     diff and explain why/how, same grouping rules as the infrastructure step. Explicitly call out any
     commit that bypassed branch protection or a required status check (visible in the push output as
     something like "Bypassed rule violations") — that's a notable callout for the journal, not routine.
   - **Docs written today:** `searchConfluenceUsingCql` with
     `creator = "712020:0725a807-b201-4065-8eb4-f690af9ca046" AND type = page AND lastmodified >= "<today>" ORDER BY lastmodified DESC`
     (exclude any `... Daily Summary` / `... This Week Last Week` page). `getConfluencePage` each to write
     an accurate 1–2 sentence summary.

4. **Compose the page** (markdown `contentFormat`) using the sections above. Each entry is a short
   paragraph or rich bullet — enough to convey intent and reasoning — with Jira
   (`https://flocksafety.atlassian.net/browse/DO-XXXX`), PR, and doc
   (`https://flocksafety.atlassian.net/wiki/spaces/FLY/pages/<id>`) links inline. Put user-requested
   notes under `## Notes`.

5. **Create the page** with `createConfluencePage`:
   `cloudId=flocksafety.atlassian.net`, `spaceId=3644915744` (personal space),
   `parentId=<the month page id from step 1>`, computed title, markdown body. Return the page URL.

## Voice

Still the user's voice — plain, direct, engineer-to-engineer — but **fuller than the weekly**: complete
sentences that carry the *why* and *how*, not just what. Name the tools, repos, and services explicitly.
Explain design choices and trade-offs when they came up. Avoid corporate filler and status-speak; this
is a working journal, so favor concrete reasoning ("moved X to Parameter Store so pods only see the
secrets they use") over vague summaries ("worked on secrets"). Keep it skimmable with the lifecycle
sections, but let entries breathe.

## Reference: page skeleton

```markdown
# M/DD Daily Summary

_Optional framing paragraph of the day's focus — can string together several threads, e.g. "Focus:
rolling the per-template bootstrap.sh script into one centralized GitHub Action across the aviation
service templates, standing up two new dev-tooling repos, and a Cycode remediation pass on
infrastructure — plus unblocking Dawsin and Brandon and confirming the plan for the remaining Aviation
AWS accounts."_

## Created

* **[repo#NN](<pr-url>) — <title>.** What it does and why: <1–3 sentences on the problem and approach>. ([DO-XXXX](https://flocksafety.atlassian.net/browse/DO-XXXX))

## In progress

* **<thing being worked on>** ([DO-XXXX](https://flocksafety.atlassian.net/browse/DO-XXXX)). Why: <goal/problem>. How: <current approach, what's done vs. left>.

## Needs review

* **[repo#NN](<pr-url>) — <title>.** <what it changes; what a reviewer should focus on / risk>. ([DO-XXXX](https://flocksafety.atlassian.net/browse/DO-XXXX))
* [DO-XXXX](https://flocksafety.atlassian.net/browse/DO-XXXX) — <ticket in review, what's pending>.

## Closed

* **[repo#NN](<pr-url>) — <title>** (merged). <what landed and its effect>. ([DO-XXXX](https://flocksafety.atlassian.net/browse/DO-XXXX))
* [DO-XXXX](https://flocksafety.atlassian.net/browse/DO-XXXX) — <ticket done, outcome>.

## Docs

* [<page title>](https://flocksafety.atlassian.net/wiki/spaces/FLY/pages/<id>) — <1–2 sentence summary of what it covers and why it was written>.

## Notes

* <any note the user asked to include — otherwise leave "* " empty>
```
