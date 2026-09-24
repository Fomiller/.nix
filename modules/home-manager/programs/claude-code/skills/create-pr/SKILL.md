---
name: create-pr
description: Use when the user asks to open, create, or raise a pull request (e.g. "open a PR", "make a PR for this", "push this up and PR it"). Also use when writing or rewriting a PR title or PR description, or when naming a branch for ticketed work. Covers branch naming, conventional-commit PR titles with the ticket key as scope (Jira on flock-mac, Linear on nimbus-mac), the three PR description length tiers, and the writing tone rules (plain English, no AI attribution).
version: 2.0.0
---

# Create PR

All the rules (tracker resolution, ticket handling, branch naming, title
format, description tiers, tone, no-AI-attribution) now live in the
`create-pr` agent, pinned to `claude-sonnet-5` so PR writing stays on a fixed
model regardless of what the main session is running.

Delegate to it with the `Agent` tool, `subagent_type: "create-pr"`, passing:

- the repo path and branch
- the ticket key if the user gave one
- confirmation of whether work is already committed

Do not duplicate the PR-writing rules here or run them inline in the main
session. If the agent asks a clarifying question (ticket needed, tracker
ambiguous), relay it to the user and resume the agent with the answer.
