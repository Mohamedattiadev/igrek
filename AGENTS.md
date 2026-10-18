# Working on God Eye

Instructions for any AI coding agent in this repository (Claude Code reads them through CLAUDE.md).
The roadmap is `plan.md`; the architecture, drawn from the code, is `docs/architecture.md`.

## Layout
- `apps/server`: Bun server, SQLite (`src/db.ts` holds the migrations, append-only).
- `apps/web`: React app (Vite). Talks to the server only over HTTP and WebSocket.
- `apps/hub`: the team hub, deployed on its own.
- `packages/core` (shared types), `packages/i18n` (texts), `packages/learn` (cheat sheets and roadmaps), `packages/genui` (OpenUI components).

## Before every commit, all of these must pass
```sh
export PATH="$HOME/.bun/bin:$PATH"
./node_modules/.bin/biome check --write . && ./node_modules/.bin/biome check .
bun run typecheck && bun run lint:dead && bun run lint:arch && bun run lint:db && bun run lint:quality
bun test && bun run build && bun run lint:bundle
```
- `lint:arch`: layer rules and no import cycles. `lint:db`: schema, query and migration rules.
- `lint:quality`: complexity, function length, parameters, empty blocks, floating promises, copies.
- These gates are ratchets: what existed when they came in is in `scripts/*-baseline.json` with a reason.
  Never raise a baseline to make a change pass; split the code or fix the problem instead.
- A new migration: run `bun scripts/db-check.ts --lock`. An architecture change: `bun run c4`.

## Rules
- Interface texts go in both `packages/i18n/locales/en.json` and `tr.json`, with the same keys. No hard-coded English in components.
- No emoji anywhere (interface, texts, CLI output, commit messages). Icons come from lucide.
- Everything stays free: no paid APIs, no telemetry. A new package needs a release at least two weeks old, pinned exactly.
- Agents never push, deploy or publish on their own.
- Do not touch `~/.ssh`. In Docker: never `--privileged` or host mounts of /dev, /run or cgroups, no systemd in containers.
- `plan.md`: change single lines exactly (never with sed) and keep the user's requirement text as it is.
- Comments explain why, in plain English, like the code around them.
