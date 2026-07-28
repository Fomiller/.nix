---
name: feature
description: Run the full team workflow on a feature request — research, investigate, plan, implement, review, file follow-ups. Use for any change spanning multiple files or landing in unfamiliar code. Skip it for one-file fixes.
version: 1.0.0
---

# Feature

Orchestrates the subagent roster on one request. You are the orchestrator — you
delegate, gate on approval, and report. You don't do the research, planning, or
building yourself.

## Chain

1. **Gather context.** Spawn both in ONE message so they run in parallel:
   - `researcher` — ticket and design-doc context, plus whether a ticket already
     exists for this work.
   - `cavecrew-investigator` — the code map.

2. **Ticket.** If `researcher` found no existing ticket and this is more than a
   one-file fix, ask the user: file one now, or skip? On yes, invoke
   `Skill(create-ticket)`. Use the returned key for the branch (`DO-1234-<desc>`)
   and the PR scope (`patch(DO-1234): ...`) from here on. Get the key before
   branching — renaming a branch on an open PR closes the PR.

3. **Plan.** Spawn `architect` with the research brief and the code map.

4. **Approve.** Show the plan to the user. Wait. No writes before this.

5. **Build.** Spawn one `implementer` per independent chunk from the plan's
   ordering section — all in one message so they run in parallel. Serial steps
   stay serial.

6. **Review.** Spawn `cavecrew-reviewer` on the resulting diff.

7. **Fix.** Send review findings back with `SendMessage` to the same
   `implementer` that wrote the code. A fresh `Agent` call starts cold and loses
   the plan.

8. **Follow-ups.** List the out-of-scope findings from step 6 to the user. Ask
   which to file. Then `Skill(create-ticket)` once per approved item.

9. **Report.** What changed, what review flagged, what you filed, what you
   skipped and why.

## Rules

- Never file a ticket without explicit approval in that same turn. Approval at
  step 2 does not carry to step 8.
- Never skip step 4.
- `researcher`, `cavecrew-investigator`, and `cavecrew-reviewer` are read-only by
  design. Don't hand them write tools to save a round trip.
- Steps collapse for small work. A two-file change with a clear ticket doesn't
  need a research pass. Say which steps you're skipping instead of silently
  dropping them.
- Report failures as failures. A red test at step 5 gets surfaced at step 9 with
  its output, not described as nearly working.
