---
name: create-ticket
description: Use when the user asks to create, file, or open a Jira ticket (e.g. "create me a ticket for...", "file a ticket", "make a jira ticket for this"). Creates the ticket on the DO (SRE) board, in the current sprint, assigned to Forrest, labeled sre-aviation, status "Needs Triage" — unless the user specifies otherwise. Returns the ticket link; the user triages story points/parent manually afterward.
version: 1.0.0
---

# Create ticket

Turns a ticket description (pasted spec, bug report, short ask) into a Jira issue with a
consistent set of defaults, then hands it back to the user for manual triage (story points,
parent epic, etc.) — this skill never sets those.

## Fixed facts (reuse these — don't rediscover them)

- **cloudId:** `flocksafety.atlassian.net`
- **Default project key:** `DO` (display name "SRE", board id 96)
- **Default issue type:** `Task`
- **Default label:** `sre-aviation`
- **Default assignee:** Forrest — accountId `712020:0725a807-b201-4065-8eb4-f690af9ca046`
- **Default status:** `Needs Triage` (id `10146`) — this is already the DO project's default
  creation status, so it normally requires no explicit transition. Verify after creation (see
  step 4) rather than assuming.
- **Sprint field:** `customfield_10020`

## Defaults vs. overrides

Apply all defaults below unless the user's request explicitly says otherwise (different board,
different assignee, no label, specific status, etc.). If they name a different project key,
resolve it with `getVisibleJiraProjects` rather than guessing.

## Workflow

1. **Find the current active sprint** for the target board (don't hardcode a sprint id — it
   changes every ~3 weeks). Run:
   ```
   searchJiraIssuesUsingJql:
     jql: project = "DO" AND sprint in openSprints() ORDER BY updated DESC
     fields: ["customfield_10020"]
     maxResults: 1
   ```
   Read `fields.customfield_10020[]`, pick the entry with `state == "active"` (and matching
   `boardId` if the user overrode the board), and take its `id`. If no open sprint is found, ask
   the user before proceeding rather than guessing.

2. **Draft the summary and description** from what the user gave you:
   - If they pasted a full ticket spec (title + body), use their title as `summary` verbatim and
     pass the rest through as `description` in `contentFormat: markdown`, preserving their
     headings/formatting as-is — don't rewrite or summarize their content.
   - If they gave a short ask, write a concise summary and a short description capturing intent.

3. **Create the issue** with `createJiraIssue`:
   - `cloudId`: `flocksafety.atlassian.net`
   - `projectKey`: `DO` (or override)
   - `issueTypeName`: `Task` (or override)
   - `summary`, `description`, `contentFormat: markdown`
   - `assignee_account_id`: `712020:0725a807-b201-4065-8eb4-f690af9ca046` (or override)
   - `additional_fields`: `{"labels": ["sre-aviation"], "customfield_10020": <active sprint id>}`
     (merge in any other overrides the user asked for, e.g. `priority`, `components`)

4. **Verify status is "Needs Triage"**. Check the created issue's status (or just trust the
   project default confirmed in the Fixed facts above); if it landed somewhere else, use
   `getTransitionsForJiraIssue` + `transitionJiraIssue` to move it to `Needs Triage`. Only do this
   if the user didn't explicitly ask for a different status.

5. **Reply with just the ticket link** — `https://flocksafety.atlassian.net/browse/<KEY>` — and a
   one-line note that it's ready for the user to triage (story points, parent epic, etc.). Do not
   set story points or a parent yourself; that's explicitly the user's manual step.
