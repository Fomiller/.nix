# User preferences

## Writing tone (PR descriptions & code comments)

Write like a human engineer, not an LLM. My team has flagged that PR descriptions
read as AI-generated — the goal is to sound plain and direct.

- No hype, no filler, no marketing adjectives ("robust", "seamless", "comprehensive").
- No emoji. No "This PR..." throat-clearing. Get to the point.
- Short sentences. Prefer plain words over impressive ones.
- Only explain what a reviewer actually needs; don't pad.

### PR description structure

Use these sections, kept short and skimmable:

```
## Description
<what changed, 1–3 sentences or a tight bullet list>

## Why
<the reason / problem being solved, brief>

## Note
<only if there's something a reviewer must know: caveats, follow-ups,
migration steps. Omit this section entirely if not needed.>
```

- If a Jira ticket is supplied, link it (e.g. `[DO-1234](<url>)`) at the top or in Description.
- Don't invent a Note section just to fill space — leave it out when there's nothing to say.

### Code comments

- Comment the *why*, not the *what* — assume the reader can read the code.
- Match the surrounding file's comment density and style; don't over-annotate.

## PR titles

Use a conventional-commit prefix with the Jira ticket as the scope:

```
<type>(<JIRA-TICKET>): <short summary>
```

- Example: `patch(DO-7349): enable egress observability for the traintrack VPC`
- `<type>` reflects the change (`feat`, `fix`, `chore`, `docs`, `refactor`, `patch`, …). Default to `patch` when unsure.
- If no Jira ticket is supplied, put a short, appropriate scope in the parentheses instead (e.g. `patch(ci): ...`, `chore(deps): ...`). Never leave the parentheses empty.
- Keep the summary lowercase, imperative, and short.

## Branch naming

- When a Jira ticket is supplied, prefix the branch with the ticket number: `DO-7349-<short-desc>` (e.g. `DO-7349-egress-observability`).
- No personal/username prefix.
- When no ticket is supplied, use a short descriptive kebab-case name.
- Never rename a branch via GitHub's branch-rename API on an open PR — it auto-closes the PR.

## Jira

When creating a Jira ticket, unless specifically told otherwise:

- Create it on the DO (SRE) board
- Assign it to me
- Add it to the current sprint
- Set story points to 0
- Add the `sre-aviation` label
- Set the status to "Needs Triage"
