---
name: this-week-last-week
description: Use when the user asks to create, write, or fill out their weekly "This Week Last Week" (a.k.a. "this week / last week") status update. Gathers the week's completed Jira tickets, PRs, and docs, then creates a NEW Confluence page in the FLY space summarizing upcoming plans and accomplishments in the user's terse voice.
version: 3.4.0
---

# This Week / Last Week weekly update

A recurring, very high-level status page the user (Forrest Miller, SRE on Aviation) writes every
week: a simple overview of what's planned next and what got done. This skill automates gathering the
source material (Jira + GitHub PRs + Confluence docs) and drafting a **new** page that matches the
established format and voice.

## Fixed facts (reuse these — don't rediscover them)

- **Confluence site / cloudId:** `flocksafety.atlassian.net`
- **Space:** `FLY`, `spaceId = 3961389061`
- **Parent folder** the weekly pages live under: `parentId = 4546920451`
- **Page title format:** `M/DD - M/DD This Week Last Week` (the current Mon–Fri work week, no
  zero-padded month; e.g. `7/06 - 7/10 This Week Last Week`)
- **Jira project:** `DO` (SRE board 96). Work is tagged with the `sre-aviation` label.
- **Forrest's Jira accountId:** `712020:0725a807-b201-4065-8eb4-f690af9ca046`
- **GitHub:** PRs span many repos — `aerodome-usa/infrastructure`, `aerodome-usa/platform`,
  `flocksafety/flock-terraform`, `flocksafety/flock-github-actions`, and the `flocksafety/flock-aviation-*`
  service templates. Always search **all** repos, not just the current one.

## Format (v3.1 — high-level body, links moved to a status-grouped reference list at the bottom)

Feedback from the reader was that the previous format was too verbose — links to every PR and Jira
ticket stuffed into every bullet. The page is now a **quick-glance summary** up top (plain, terse,
one-line bullets, no links, no ticket callouts) followed by a **reference list at the bottom** for
anyone who wants to dig into the specifics. This matches the original established format (see e.g.
the `6/22 - 6/26 This Week Last Week` page).

The page opens with an optional italicized framing paragraph, then has two H1 sections, a Notes
stub, and a Reference section, **in this order**:

- **Intro paragraph** (optional, italicized, like the `daily-summary` skill's framing line) — sets
  context for the week: the theme(s) that dominated, e.g. "Focus: rolling the per-template
  `bootstrap.sh` script into one centralized GitHub Action across the aviation service templates,
  standing up two new dev-tooling repos, and a Cycode remediation pass on infrastructure — plus
  unblocking Dawsin and Brandon and confirming the plan for the remaining Aviation AWS accounts."
  It's usually one sentence but can run long, stringing together several threads with commas / "plus" —
  don't compress it into a terse one-liner. Omit it entirely if there's nothing worth framing.
- **`# This week`** (first) = forward-looking **plans**, plain one-line bullets only. **No labelled
  callouts (no "PRs to get merged" / "In progress" / "In review" lists) and no links** — that detail
  now lives in the Reference section at the bottom, where each Jira ticket's status is visible anyway.
- **`# Last week`** (second) = what actually got **done** last week (retrospective), plain one-line
  bullets, themed and terse. **No inline Jira/PR links** — those move to the Reference section.
- **`## Notes`** = where **every note the user asks to include goes** — whenever the user says
  to "add a note" (short week, PTO, caveats, callouts, etc.), put it as a bullet under this heading,
  not inline under another section. Leave it as an empty `* ` stub only when there are no notes.
- **`## Reference`** (last, new in v3) — the detail list for anyone curious. Two subsections, each
  **grouped into status buckets (v3.1)** rather than one flat list — this is the only place links and
  ticket/PR identifiers appear on the page:
  - **`### Jira Tickets`** — every Jira ticket touched that week (updated during the week, or still
    open/in-progress/in-review going into this week), bucketed under `####` sub-headings **in this
    order**, and skip any bucket with nothing in it:
    1. **In Progress** — current status is In Progress, regardless of when it was created
    2. **In Review** — current status is In Review, regardless of when it was created
    3. **Closed** — resolved this week, but opened before this week
    4. **Created & Closed** — opened *and* resolved within the same week (full lifecycle, worth
       calling out as a fast turnaround rather than burying in "Closed")
    5. **Needs Triage** — anything else still sitting unstarted (backlog, needs triage, etc.),
       regardless of when it was created

    A ticket's bucket is its **current status** — full stop — except for the one special case above
    (opened and resolved in the same week gets pulled out of "Closed" into its own bucket since that's
    a notable fast turnaround). Don't add a separate "Created" bucket for still-open tickets: a ticket
    created this week that's now In Progress belongs in "In Progress" next to older tickets in the same
    state, not off in its own "just opened" pile — the reader wants to know what's actively being
    worked vs. reviewed vs. done, not when it was filed.

    Each bullet: `[DO-XXXX](https://flocksafety.atlassian.net/browse/DO-XXXX) — <summary>`. Drop the
    trailing `(<status>)` — the sub-heading already says it.
  - **`### PRs`** — every PR opened/merged that week, bucketed under `####` sub-headings **in this
    order**, and skip any bucket with nothing in it:
    1. **Open** — opened this week, not yet merged/closed
    2. **Merged**
    3. **Closed** — closed without merging

    Each bullet: `[repo#NN](<pr-url>) — <short desc>`. Drop the trailing `(<state>)` — the sub-heading
    already says it.

Each weekly page is titled with the **current** week; its "Last week" describes the week that just
ended. **Always CREATE A NEW PAGE — never overwrite the previous week's page.**

## Workflow

0. **Backfill any missing daily-summary weekdays for this week before gathering anything.** This
   weekly rollup and the `daily-summary` journal should never disagree about what happened, and a
   missing daily page is the easiest way for that to happen (e.g. running this on a Friday when Monday
   and Wednesday's daily summaries never got written). Check the `daily-summary` skill's Confluence
   pages for every weekday (Mon–Fri) from the start of the current work week through today — skip
   weekends, they never get a page. For each weekday missing a page, invoke the `daily-summary` skill's
   full gap-backfill + workflow for that specific date (see its "Backfilling gaps" section) **before**
   continuing to step 1 below, so this week's "Last week" bullets and Reference list are drawn from a
   complete journal, not a partial one. This applies regardless of which day of the week this skill is
   run on — e.g. running it Friday with Monday and Wednesday missing backfills both before summarizing.

1. **Read the most recent existing weekly page first** (search the FLY space / parent folder `4546920451`
   for the latest `... This Week Last Week` page) to confirm the current format and pick up the previous
   week's "This week" plans (they often become this week's "Last week" accomplishments). Use
   `getConfluencePage` with `contentFormat: markdown`.

2. **Determine the new week's date range** and build the title `M/DD - M/DD This Week Last Week`.
   Confirm/adjust with the user if the boundary is ambiguous.

3. **Gather completed work for "Last week" and the Reference list:**
   - Jira: `searchJiraIssuesUsingJql` with
     `assignee = "712020:0725a807-b201-4065-8eb4-f690af9ca046" AND updated >= "<week-start>" ORDER BY updated DESC`
     (fields: summary, status, issuetype, created, updated, resolution, labels — `created` is required
     to tell "Created & In Review" / "Created & Closed" apart from tickets that merely moved into that
     status this week). Also pull tickets still open in `In Progress` / `In Review` (regardless of
     last-updated date) so they show up in the Reference list heading into "This week".
   - PRs across all repos:
     `gh search prs --author "@me" --created ">=<week-start>" --limit 60 --json number,title,state,createdAt,url,repository`
   - **Confluence docs the user wrote/edited that week:** `searchConfluenceUsingCql` with
     `creator = "712020:0725a807-b201-4065-8eb4-f690af9ca046" AND type = page AND lastmodified >= "<week-start>" ORDER BY lastmodified DESC`.
     **Exclude the weekly-update pages themselves** (any `... This Week Last Week` title) **and the
     daily-summary journal pages** (any `... Daily Summary` title, from the `daily-summary` skill).
     Daily summaries are fine to read as *context* (they can help reconstruct what got done that week),
     but never call them out or link them as a "doc" accomplishment — they're the journal, not a
     deliverable. Remaining pages represent real documentation work and belong in "Last week" as a
     plain-bullet accomplishment (no link in the bullet itself — the doc has no dedicated Reference
     subsection; if it needs a link, fold it into the Jira ticket it came out of).

4. **Compose the page** (markdown `contentFormat`), sections in order **Intro paragraph (optional) →
   This week → Last week → Notes → Reference**:
   - **Intro paragraph:** an italicized framing sentence covering the theme(s) that dominated the week
     — it can string together several threads (comma / "plus" separated) rather than staying terse, per
     the example above. Skip it entirely if there's nothing worth framing — don't manufacture filler.
   - **This week:** plain one-line forward-looking plan bullets the user gives. No links, no callout
     lists.
   - **Last week:** ~8–12 high-level themed bullets, plain one-liners, **no links**. Consolidate work
     that spans many repos/tickets into a single bullet (e.g. a refactor across 9 repos = one bullet).
   - **Notes:** put any note the user asks to include (e.g. *"Short week — out for the July 4th
     holiday."*, PTO, caveats) as a bullet under the `## Notes` heading — always there, never inline
     under `# This week` / `# Last week`.
   - **Reference:** `### Jira Tickets` and `### PRs`, each split into the status buckets defined above
     (`#### In Progress`, `#### In Review`, `#### Closed`, `#### Created & Closed`, `#### Needs Triage`
     for tickets; `#### Open`, `#### Merged`, `#### Closed` for PRs) — one bullet per ticket/PR gathered
     in step 3, linked, no trailing status/state annotation since the bucket conveys it. Skip empty
     buckets. This is where all the detail from the old verbose format now lives.

5. **Create the page** with `createConfluencePage`:
   `cloudId=flocksafety.atlassian.net`, `spaceId=3961389061`, `parentId=4546920451`, the computed title,
   and the markdown body. Return the page URL.

## Voice

Match the user's style: terse, high-level, gerund/imperative-led bullets ("Refactor…", "Add…",
"Stand up…", "Investigate…"), tool and repo names spelled out, comma-separated lists for grouped work.
No marketing fluff, no long sentences. Keep it a *simple* overview — the reader wants signal, not detail.
Links and ticket/PR identifiers belong ONLY in the Reference section, never inline in This week / Last week.

## Reference: page skeleton

```markdown
_Optional framing paragraph of the week's focus — can string together several threads, e.g. "Focus:
rolling the per-template bootstrap.sh script into one centralized GitHub Action across the aviation
service templates, standing up two new dev-tooling repos, and a Cycode remediation pass on
infrastructure — plus unblocking Dawsin and Brandon and confirming the plan for the remaining Aviation
AWS accounts."_

# This week

* <forward-looking plan bullet>
* <forward-looking plan bullet>

# Last week

* <themed accomplishment, one line, no links>
* <themed accomplishment, one line, no links>

## Notes

* <any note the user asked to include, e.g. short week / PTO / caveats — otherwise leave "* " empty>

## Reference

### Jira Tickets

#### In Progress

* [DO-XXXX](https://flocksafety.atlassian.net/browse/DO-XXXX) — <summary>

#### In Review

* [DO-XXXX](https://flocksafety.atlassian.net/browse/DO-XXXX) — <summary>

#### Closed

* [DO-XXXX](https://flocksafety.atlassian.net/browse/DO-XXXX) — <summary>

#### Created & Closed

* [DO-XXXX](https://flocksafety.atlassian.net/browse/DO-XXXX) — <summary>

#### Needs Triage

* [DO-XXXX](https://flocksafety.atlassian.net/browse/DO-XXXX) — <summary>

### PRs

#### Open

* [repo#NN](<pr-url>) — <short desc>

#### Merged

* [repo#NN](<pr-url>) — <short desc>

#### Closed

* [repo#NN](<pr-url>) — <short desc>
```

(Omit any bucket with no entries — don't print an empty `#### Heading` with nothing under it.)
