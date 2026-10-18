# ADR 0001: Lists in a column and copied names

- Status: accepted
- Date: 2026-10-18
- Checked by: `bun run lint:db` (rules `list-in-column` and `denormalized-copy`)

## Context

Normal forms (Elmasri & Navathe, *Fundamentals of Database Systems*, 7th ed., ch. 14) say a column
holds one value (1NF) and every fact is stored once (3NF). God Eye's schema breaks both on purpose
in two places, and the database gate lists each case.

## Decision

1. **Lists kept as JSON in one column** (for example `sessions.files_touched`, `sessions.packages`,
   `comments.mentions`, `chat_history.queue`). Each list belongs to exactly one row, is always read and
   written whole with that row, and no query looks inside it (the code only compares the whole value,
   such as `packages != '[]'`). A child table would add a join to every read and buy nothing.
2. **Names copied next to an id** (`sessions.author_name`, `comments.author_name`,
   `env_changes.author_name`, `memory_items.author_name`, `team_messages.from_name`). The id points at
   a team member who lives on the team hub, not in this database, so there is no local row to join.
   The name is kept so the app shows who did something even when the hub is out of reach.

## Consequences

- A name changed on the hub stays old in rows written before the change. Acceptable: it is shown as
  "who wrote this at the time".
- When a query ever needs to search inside a list, that list moves to its own table first; the gate
  will then show the column as fixed and it must leave `scripts/db-baseline.json`.
