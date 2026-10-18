# ADR 0002: Layers of the server

Status: accepted (October 2026)

## Context

The server grew feature by feature. The C4 component diagram drawn from the imports (`docs/architecture.md`)
showed almost every area importing almost every other one (50 of 72 possible arrows), so nothing could be
changed or tested on its own and nobody could say which direction was right.

## Decision

The server is layered (Mark Richards, *Software Architecture Patterns*, "Layered Architecture"). An area may
use the areas below it, never the ones above:

1. **foundation**: the event bus, the database and its migrations, config, settings, sealing, JSON-lines reading,
   process environment, file access rules, the local model runner, secret scrubbing and shared-text merging (Yjs). Uses nothing.
2. **sessions**: reading AI session files, the store, summaries, accounts and limits, session health.
3. **knowledge** (learning, library, docs), **ops** (servers, deploys, monitors, env files, costs),
   **sync** (team hub): each uses foundation and sessions.
4. **insight** (checks, tests, lessons): also knowledge.
5. **chat** (chats, terminals, checkpoints, trust): also insight and ops.
6. **preview** and **agents** (personas, flows, schedules, the board): the top feature layers.
7. **api**: `app.ts`, `index.ts` and every `*-routes.ts` file. The composition root; it wires the areas
   together and may use all of them.

The table is `INTENDED` in `scripts/c4.ts`. `bun run c4` draws the arrows that break it in red as "drift".

## Consequences

- The imports that broke the rule when it was written (19, mostly a lower area taking a higher service in
  its constructor) are listed in `scripts/c4-drift.json` with the reason. A test fails when a new one
  appears, and when one is fixed but still listed, so the list only shrinks (a ratchet).
- A lower area that needs something from above declares a small interface of its own and receives an
  implementation from `index.ts` (Dependency Inversion), instead of importing the higher module.
- The rule is about direction, not about count: a route file importing six areas is fine.
