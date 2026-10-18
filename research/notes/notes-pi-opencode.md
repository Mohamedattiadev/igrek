# Research notes: pi and opencode (for God Eye)

Scope: read only (README, docs, key source). Nothing installed, built or run. God Eye repo untouched.
Paths below are relative to each repo root. "GE" = God Eye. Line numbers are from the commits listed.
Both repos are MIT, so code may be reused with attribution (keep the copyright notice: pi "Copyright (c) 2025 Mario Zechner", opencode "Copyright (c) 2025 opencode").
Caveat: I only listed GE files by name (not read them), so "GE already has X" means "a file with that name exists"; verify before building.

---------------------------------------------------------------------------------------------------

## 1. Overview of the two repos

### pi (earendil-works/pi, formerly badlogic/pi-mono)
- What: a minimal terminal coding agent plus the libraries under it. Philosophy (README.md): small core, no sub-agents or plan mode built in; everything else is extension, skill, prompt template, theme, shipped as "pi packages" over npm/git.
- Stack: TypeScript on Node 22.19+, npm workspaces, vitest, biome. Custom TUI library with differential rendering.
- License: MIT (LICENSE, Mario Zechner, 2025).
- Commit read: 482c1381a00d8d00bc81697e4a980c593db6803e
- Size (TS lines, approx): coding-agent 162k (CLI, sessions, tools, compaction, extensions, modes), ai 75k (multi-provider LLM API, ~30 providers, generated model catalog), durable 66k (experimental crash-safe conversation runtime), tui 40k, chord 31k (hot-reloadable object/RPC runtime), agent 6.8k (agent loop), codemode 5k, mcp 4.9k, env 3.6k (remote execution over SSH with a Rust daemon), evals 3.3k, telemetry 1.2k.
- Interfaces on one core (docs/how-pi-works.md): interactive TUI, print mode, JSON-event mode (JSONL), RPC mode (JSONL over stdin/stdout, docs/rpc.md, rpc-commands.md), in-process SDK (docs/sdk.md).
- Explicitly has NO permission system (README "Permissions & Containerization", docs/security.md): runs with the user's rights; advice is to sandbox (Docker, Gondolin micro-VM extension, OpenShell). "Project trust" only gates loading of `.pi/*` resources.

### opencode (anomalyco/opencode, formerly sst/opencode)
- What: open-source coding agent with a background server, TUI, web/desktop app (Electron) and SDK. This checkout is the "V2" rewrite (package versions 2.0.x): Effect-TS everywhere, event-sourced sessions in SQLite, HTTP API generated into a client SDK.
- Stack: Bun/TypeScript, Effect 4 beta, Drizzle + SQLite, SolidJS for web/desktop UI, OpenTUI (@opentui/solid) for the TUI, Shiki + marked for markdown, Electron for desktop.
- License: MIT (LICENSE, "Copyright (c) 2025 opencode").
- Commit read: 63c1a27af5a391d9caa55b82694f496911e1859b (default branch is `dev`, see AGENTS.md).
- Size (TS lines, approx): app 179k (web/desktop UI), core 175k (sessions, tools, permissions, snapshot, mcp, plugins), tui 108k, ai 80k (provider layer), gui-extensions 61k, codemode 31k, session-ui 29k (shared chat/timeline components), ui 37k, merman 22k (mermaid renderer), stats 21k.
- Dependency rule (AGENTS.md): Schema -> Core/Protocol -> Server; Client may use Schema+Protocol only; `sdk` composes them. Generated client (`bun run generate` in packages/client). This is a clean layering GE could copy for `@godeye/core` vs server vs web.

---------------------------------------------------------------------------------------------------

## 2. UI / UX findings

### U1. Streaming markdown that only re-renders the last block (opencode, MIT)
- Where: packages/session-ui/src/components/markdown-stream.ts (lines 1-153), markdown.worker.ts (1-171), markdown-worker-queue.ts, markdown-cache.tsx (1-195, LRU of 200 + DOMPurify), markdown.tsx.
- What: while text streams, `stream()` lexes with `marked`, splits into blocks. All blocks but the last are "full" (immutable, cached). The tail is "live": `remend` heals unclosed markdown (open bold, link, fence) so the tail renders cleanly. An open code fence is its own block (mode "code", not complete) and is appended character-wise without re-lexing unless a closing fence arrives (`project()`, lines 110-153). Parsing and Shiki highlighting run in a Web Worker with a "latest wins" queue (`createLatestWorkerQueue`, superseded requests dropped). `@shikijs/stream` tokenizes incrementally.
- Why for GE: GE `Markdown.tsx` runs marked + shiki + DOMPurify and enhances code blocks on the rendered DOM after each change (I read its first 40 lines). On long streamed answers that re-parses and re-highlights the whole message on each chunk. Block-level memoization makes long chats smooth.
- Adopt: new `apps/web/src/lib/markdownStream.ts` (copy `stream`/`project`, add `remend` dep), render blocks as separate memoized React components in `Markdown.tsx`; optional worker later.
- Effort: M (S for block splitting + remend only). License MIT.

### U2. Timeline detail presets: everything / detailed / compact / quiet / text-only (opencode, MIT)
- Where: packages/session-ui/src/timeline/detail.ts (1-121); grouping logic in timeline/projection.ts (lines ~650-980, group type "context").
- What: every assistant part is categorised (shell, edit, thinking, subagents, notices, tools). Each category has placement `separate | grouped | hidden` and details `collapsed | expanded`. Five named presets. In "grouped" mode consecutive reads/greps/etc. collapse into one animated summary row ("Read 3 files, searched 2 times", components/tool-count-summary.tsx). Reasoning has `hidden | compact | full` (projection.ts line 49). Notices (errors, failed shell, running compaction) always break through (`timelineNoticeRequired`).
- Why for GE: GE chats show tool cards; the audience includes non-experts (plan 7.2 "teyze testi"). A "Quiet / Normal / Everything" switch per chat is the cheapest way to serve both beginners and power users.
- Adopt: setting in `apps/web/src/pages/Chat.tsx` (and Settings), a pure `groupToolCalls(messages, detail)` function in a new `lib/timeline.ts`; summary row component reusing existing tool cards. Effort: M.

### U3. Line comments on diffs that go back to the agent as context (opencode, MIT)
- Where: packages/session-ui/src/components/line-comment.tsx (1-448), line-comment-annotations.tsx, session-review.tsx (721 lines), pierre/commented-lines.ts, pierre/diff-selection.ts; composer side: packages/app/src/composer/comments.tsx, comment-note.ts, history/entry.ts (comments stored in prompt history).
- What: in the review/diff panel, click a line or drag a range, write a comment; comments are chips in the composer and are serialised into the next prompt (`comment-note.ts`). Review UI is virtualised (pierre/virtualizer.ts) and uses `@pierre/diffs` for diff rendering with a worker (pierre/worker.ts).
- Why for GE: GE has `DiffView.tsx`, `Comments.tsx` (team comments, I only know the name) and `CheckpointRestore.tsx`. Review comments that become prompt text close the loop "look at the diff, tell the agent exactly what to fix", which is the main non-terminal advantage of a GUI.
- Adopt: add per-line comment affordance in `DiffView.tsx`; a "pending comments" tray above the chat composer (`HomeComposer.tsx`/Chat composer) that appends a formatted note (file:line + text). Effort: M.

### U4. Composer as an explicit state machine (opencode, MIT)
- Where: packages/app/src/composer/suggestions/machine.ts (1-~200): state `{mode: normal|shell, popover: closed|context|command-inline|command-menu, drag, focus, historyIndex}`, events/commands lists; composer/history/store.ts (separate input history for normal and shell mode, with comments); composer/prompt-parts.ts (prompt is a list of typed parts: text, file mention with selection range, image, path attachment); composer/editor/ (contenteditable editor with mention pills); composer/attachments/ (drop zone, uploads).
- What: all keyboard behaviour (arrow through suggestions, Esc, history up/down, `!` switches to shell mode, `@` opens context picker, `/` command menu) is a pure reducer with tests (machine.test.ts, interaction.test.ts).
- Why for GE: GE has `SlashMenu.tsx`, `HomeComposer.tsx`, `PromptPicker.tsx`; plan says "one box to write in". A reducer-based composer is testable (GE's web typecheck leaves tests to bun test) and avoids the usual popover/focus bugs. Shell mode (`!cmd` runs in the project terminal) and per-mode history are small adds GE lacks as far as I can tell.
- Adopt: extract composer logic into `apps/web/src/lib/composerMachine.ts` with tests; add `@file` mention pills with line ranges (ties into FilePreview/CodeEditor selection). Effort: M-L.

### U5. Multi-tab notification de-duplication with Web Locks (opencode, MIT)
- Where: packages/app/src/shell/notifications/coordinator.ts (1-~80), sound.ts, notification.tsx.
- What: notifications ("agent finished", "needs permission") fire only from the tab that holds focus, using `navigator.locks` with a shared "focus" lock, plus a bounded "claimed event ids" set so two tabs/windows do not both notify. Also plays attention sounds (tui/src/attention*.ts).
- Why: GE runs in a browser and also has Inbox, Team presence and approvals; users keep several tabs. Duplicate toasts/sounds are an easy annoyance to avoid.
- Adopt: `apps/web/src/lib/notifyOnce.ts` used by Inbox/approval/limit alerts. Effort: S.

### U6. Auto-approve permissions per project, client side, with sweep-on-reconnect (opencode, MIT)
- Where: packages/app/src/session/requests/auto-approve.ts (1-~120); docks: session-permission-dock.tsx, session-question-dock.tsx, session-websearch-dock.tsx; reply options once/always/reject (packages/schema/src/permission.ts lines 36-40).
- What: a client setting ("auto-approve in this project") answers `permission.asked` events immediately; because the event stream does not replay requests asked while disconnected, it sweeps pending requests on every (re)connect, with bounded retries (retryLimit 2, delay 1s*attempt) and a bounded "already responded" set (1000).
- Why: GE has `ApprovalCard.tsx`, `RiskBadge.tsx`, `guards.ts`. A per-project "auto-approve low risk" with correct reconnect handling is exactly the missing robustness; the sweep-on-connect lesson applies to GE's SSE/WebSocket approvals too.
- Adopt: setting in project page + sweep in the approvals hook. Effort: S-M.

### U7. Chat search, message nav, hash links, virtualised timeline (opencode, MIT)
- Where: packages/app/src/session/timeline/search-controller.ts, search-bar.tsx, virtualizer.tsx, virtual-items.ts, use-session-hash-scroll.ts (deep link to a message via URL hash), session-ui/src/components/message-nav.tsx.
- Why: GE has search (plan 1.7) but in-chat find, jump-to-message and deep links to a message (useful with team sync: "look at this answer") appear absent. Virtualisation matters once sessions have thousands of parts.
- Adopt: `Chat.tsx`/`Session.tsx`: `#msg-id` anchors, find-in-chat bar, windowed list (e.g. @tanstack/react-virtual). Effort: M.

### U8. Tabs, mobile drawers, command palette, search-able settings (opencode, MIT)
- Where: packages/app/src/shell/tabs/ (tabs.tsx, closed.ts = reopen closed tab, memory.ts), shell/mobile-drawer.tsx, mobile-panel-drawer.tsx, shell/commands/palette.ts + command.tsx (commands carry keybinds, registered per feature), settings/search*.ts(x) (settings are indexed and searchable, with "reveal" scroll-to), settings/keybinds/keybinds.tsx + migration.ts (user-editable keybinds with migration of old ids).
- Why: GE has `CommandPalette.tsx`, `Tour.tsx`, `nav.ts`. Gaps worth copying: reopen-closed-tab (Ctrl+Shift+T), settings search (GE Settings.tsx is likely long), rebindable shortcuts, mobile drawer for side panels.
- Effort: S each (closed tabs, settings search), M (rebindable keybinds).

### U9. Keyboard-first TUI features that map to the web (opencode, MIT)
- Where: packages/tui/src/feature-plugins/prompt/btw.tsx (1-~120): "/btw" side question answered without tools, from the conversation so far; instructions text at lines 16-20. Sidebar plugins: sidebar/context.tsx (context-usage), sidebar/mcp.tsx (MCP status), system/stats.tsx.
- Why: GE has QuickAsk (plan 2.6 "Hizli Soru (btw)"). Confirms the design; note opencode forbids tools in that call ("session.generate exposes tools but runs no tool loop"). Check GE QuickAsk also uses a no-tools call. Effort: S (verify only).

### U10. Pi interactive mode: components worth mirroring (pi, MIT)
- Where: packages/coding-agent/src/modes/interactive/components/: tree-selector.ts (session tree navigation), session-selector(-search).ts, tool-execution.ts (tool card with collapsed/expanded output, uses tools/renderers/ and render-utils.ts), bash-execution.ts, diff.ts, compaction-summary-message.ts, branch-summary-message.ts, footer.ts (context %, cost, model; docs show routed model "auto high -> model medium"), model-selector.ts, scoped-models-selector.ts (a short list of models to cycle), thinking-selector.ts, first-time-setup.ts, trust-selector.ts (project trust prompt), visual-truncate.ts (truncate tool output by visual lines).
- Why: the footer (context window used, tokens, cost, cache) and "scoped models" (a user-chosen shortlist for quick switching) are cheap, high-value additions to GE's model picker/status area. Compaction and branch summaries are shown as first-class transcript items, not hidden.
- Effort: S-M.

### U11. HTML session export (pi, MIT)
- Where: packages/coding-agent/src/core/export-html/ (index.ts, template.html/css/js, ansi-to-html.ts, tool-renderer.ts; ~3.8k lines with vendored libs); docs/session-format.md; session-share.ts.
- What: a session becomes a single self-contained HTML file with tool output rendered, ANSI colours converted. opencode has an equivalent `session/commands/export.ts` (packages/app).
- Why: GE has `Replay.tsx`, `ChatCopy.tsx`, Writeups; a single-file export is the simplest way to share a session with someone outside the team and ties to the plan's "team sync".
- Adopt: server route `GET /api/sessions/:id/export.html` reusing the web renderer in static form. Effort: M.

### U12. Themes and tokens by semantic role (opencode + pi, MIT)
- Where: opencode AGENTS.md "TUI Theme Tokens" (lines ~20-25): choose tokens by role (`text.feedback`, `formfield`, `action`), never by hue; extend the schema when a role is missing. packages/theme/src, packages/tui/src/theme/. pi docs/themes.md, mac-system-theme example.
- Why: GE 7.1 already has a design system; the lesson is the rule, enforced by a test that checks light+dark+custom fallback. Effort: S (rule + test).

### U13. Storybook-driven UI and fixtures for chat states (opencode, MIT)
- Where: packages/session-ui/src/storybook/ (current-session-fixtures.ts, current-session-scenarios.ts), timeline/*.stories.tsx (file-changes, terminal-work, research-and-agents, error-card), packages/storybook, AGENTS.md "TUI Stories".
- Why: chat has many states (streaming, failed tool, permission pending, compaction running, subagent). GE's `Design.tsx` page could host fixture scenarios of the real components so regressions are visible. Effort: M. Idea is generic; code is MIT.

---------------------------------------------------------------------------------------------------

## 3. Architecture findings

### A1. Compaction: structured summary, iterative updates, file tracking, cut points (pi, MIT; opencode, MIT)
pi:
- packages/coding-agent/src/core/compaction/compaction.ts: trigger `contextTokens > contextWindow - reserveTokens` (default 16384) (`shouldCompact`, line 267; docs/compaction.md); keep the last `keepRecentTokens` (default 20k) (`findCutPoint`, line 446); never cut at a tool result; split-turn handling when one user turn exceeds the budget (two summaries merged); summary prompt with fixed sections Goal / Constraints & Preferences / Progress (Done, In Progress, Blocked) / Key Decisions / Next Steps / Critical Context (lines 507-538); second prompt that UPDATES the previous summary rather than re-summarising (lines 540-579); read/modified file lists accumulated across compactions (compaction/utils.ts, 163 lines); summary calls disable prompt-cache writes; one compact-and-retry on provider context-overflow error or early `stopReason: length`.
- Storage: compaction is a session entry `{summary, firstKeptEntryId, tokensBefore, details:{readFiles, modifiedFiles}, usage}`; originals stay in the file (docs/session-format.md, CompactionEntry). `context_edit` entries omit or replace one old message for future requests without deleting history.
opencode:
- packages/core/src/session/compaction.ts (988 lines): template with Objective / Requirements / Decisions / Work State (Completed, Active, Blocked) / Next Move / Relevant Files (max 15) / Important Context (lines ~100-140); rules (lines 140-150) such as "carry forward only unanswered requests", "preserve whether changes are uncommitted, committed, pushed, under review, merged", "do not mention the summary process"; an extra NUDGE message if the model ignores the template (line ~165); tool output truncated to 1250 chars in the summarisation input (`TOOL_OUTPUT_MAX_CHARS`); shrink retries at 70/50/35% of the rejected request size (`SHRINK_STEPS`, line 91); RESERVE_MIN 16000; image/PDF token estimates 1500/2000.
- Why for GE: GE has "summaries", "session handoff" (plan 2.8) and "session health" (1.8), which are the same problem seen from outside. The two prompts above are battle-tested templates to reuse for GE's handoff/recap (`summarizer.ts`, `RecapCard.tsx`) and the "Session Health" warning ("context is 80% full, handoff now"). The "workflow state" rule (committed/pushed/merged) is a nice addition.
- Adopt: copy prompt text into `apps/server/src/summarizer.ts` (handoff template) and make the section list the data model of a "handoff card". Use pi's iterative "previous summary + new messages" approach for long watched sessions. Effort: S (prompts), M (iterative update + file tracking).

### A2. Session tree (branch in place) and fork/clone (pi, MIT)
- Where: docs/sessions.md ("/tree", "/fork", "/clone"), docs/session-format.md (JSONL, each entry `{id, parentId}`; versions v1 linear -> v2 tree -> v3 custom roles; auto-migrated on load), src/core/session-manager.ts, compaction/branch-summarization.ts (380 lines): when you leave a branch the abandoned path can be summarised into a `branch_summary` entry so the new branch keeps the lessons.
- Why for GE: GE has checkpoints (git) and "Replay". A conversation tree lets a user go back to message N, edit it, and try again without losing the first attempt, and ties naturally to checkpoint restore (pi's examples/extensions/git-checkpoint.ts, lines 1-60: `git stash create` per turn, offer to restore code when forking). GE `CheckpointRestore.tsx` could offer "restore code AND fork conversation here".
- Adopt: store `parent_id` on GE chat messages (SQLite), UI "edit & retry from here", optional branch summary via `summarizer.ts`. Effort: L (data model), M (UI only for linear "retry from here").

### A3. Steering vs follow-up queue (pi MIT, opencode MIT)
- pi: docs/rpc-commands.md "prompt/steer/follow_up": while the agent runs, a new message must say `streamingBehavior: steer` (delivered after the current assistant turn's tool calls, before the next LLM call) or `followUp` (delivered only when the agent stops). Abort returns queued messages to the editor (docs/how-pi-works.md). Code: packages/agent/src/agent-loop.ts lines 175-210 (steering poll at start and after each tool batch) and 302-306 (follow-ups).
- opencode: packages/core/src/session/inbox.ts (550 lines): durable inbox table for pending inputs of kinds user / synthetic / compaction / move; `promote("steer"|"input")` consumes steers at step boundaries and one queued input at idle; per-session keyed mutex.
- Why for GE: when GE drives Claude Code/Codex, typing during a run is the common case. GE needs an explicit, visible queue ("will be sent after this step" vs "after it finishes") with edit/cancel. Check what `chat-routes.ts` does today.
- Adopt: a `pending_inputs` table per chat + UI chips above the composer; adapter decides how to deliver (Claude Code accepts stdin messages in stream-json mode, others may need interrupt+resume - guess, verify). Effort: M.

### A4. Permission model: wildcard rules, last-match-wins, once/always/reject with feedback (opencode, MIT)
- Where: packages/core/src/permission.ts (347 lines; `evaluate`, lines 85-95: `findLast` rule where action and resource match wildcard, default effect "ask"; `merge` = concatenation, later layers override), schema/src/permission.ts (Reply = once | always | reject; `save` patterns offered for "always"), permission/saved.ts + sql.ts (persisted "always" rules), `CorrectedError {feedback}` (user can reject WITH a message that goes back to the model), `DeclinedError`, `BlockedError {rules, permission, resources, reason}`. Agents carry a ruleset; missing agent permissions = deny all (line 18).
- Also: pi's extension examples/extensions/permission-gate.ts (1-30: regex list rm -rf / sudo / chmod 777, block when no UI), protected-paths.ts, confirm-destructive.ts, dirty-repo-guard.ts, plan-mode (read-only bash allowlist, plan-mode/utils.ts).
- Why for GE: GE `guards.ts`, `ApprovalCard.tsx`, `RiskBadge.tsx`, `SecretGuard.tsx` exist. What to borrow: (1) "Allow always" that stores a pattern (e.g. `bash: git status*`) per project, listable/revocable in project settings; (2) "Reject with feedback" so the agent is told why; (3) rule layering (global < project < persona). For tools GE only observes (Claude Code decides), GE can still offer these as hook-based decisions via Claude Code's permission hooks (plan 1.3).
- Effort: M. Wildcard matcher is tiny (packages/core/src/util/wildcard.ts).

### A5. Snapshot/revert via a private shadow git repo (opencode, MIT)
- Where: packages/core/src/snapshot.ts (244 lines), session/revert.ts, session/diff.ts, schema/src/snapshot.ts.
- What: before/after each step opencode captures the working tree as a content-addressed git tree in a separate git dir under its own data folder (`<data>/snapshot/<projectId>/<hash(worktree)>`, lines 93-100), so the user's repo, index, refs and reflog are never touched; honours the source repo's ignore rules; skips untracked files over 2 MiB (line ~112); runs `git gc`-like pack at most every 10 min (lines 116-125). API: capture / files(from,to) / diff(from,to,paths) / restore(files map path->tree). `SessionRevert.stage` restores to the state before message M, remembers the pre-revert state so the revert itself can be undone (unrevert), and returns the per-file diff.
- Compare GE: `apps/server/src/checkpoints.ts` (read the top 60 lines) already snapshots via hidden refs `refs/godeye/checkpoints/*` using a temp index and `commit-tree`, which is a good design. Differences: opencode's per-message granularity + "undo the revert" + diff between two snapshots. GE could add: tie each checkpoint to a chat message id (so "restore to before this message" is one click on any message), keep the pre-restore state as an automatic checkpoint (undo of undo; GE has `UndoToast.tsx`, verify it does this), and the 2 MiB untracked-file cap plus periodic pack so the object store does not grow.
- Effort: S-M.

### A6. Tool-input repair before validation (opencode, MIT)
- Where: packages/core/src/plugin/tool-input-repair.ts (header comment lines 8-17 lists the rules).
- What: weak models send `{"limit":"20"}`, stringified objects/arrays, `null` for optional fields, extra properties on closed objects. A pre-execute hook coerces them using the tool's JSON schema, only when unambiguous, max depth 6.
- Why for GE: GE's own MCP server (`mcp.ts`, `mcpservers.ts`) and local-model path (`localmodel.ts`) receive tool calls from such models; coercion reduces "invalid arguments" loops. Effort: S (port ~150 lines). Adoption: shared helper in `packages/core` used by `mcp.ts`.

### A7. Retry policy with provider retry-after (opencode, MIT)
- Where: packages/core/src/model-retry.ts (1-~70): exponential 2s capped at 10s per gap, max 10 retries (~84 s), jittered, honour `retryAfterMs` capped at 15 min; timeouts limited to 3 retries because each already waited minutes.
- Why: GE's `limits.ts`/`accounts.ts` handle plan limits; for API-style calls (summaries, persona runs, hallucination checks) a single tested retry policy avoids ad-hoc loops. Effort: S.

### A8. Tool output truncation and mutation queue (pi, opencode; MIT)
- pi: tools/truncate.ts lines 11-13 (2000 lines / 50 KB defaults, GREP line 500 chars), `truncateHead` (line 78) / `truncateTail` (line 168), never returns partial lines; bash keeps tail; the full output goes to a temp file whose path is told to the model. tools/file-mutation-queue.ts (61 lines): per-file promise chain keyed by `realpath`, so parallel tool calls editing the same file run in order while different files run in parallel. tools/edit-diff.ts (556 lines): edit with fuzzy matching (`normalizeForFuzzyMatch` line 36: NFKC, trailing spaces, smart quotes, unicode dashes/spaces), CRLF and BOM preserved, multiple edits matched against the original file.
- opencode: core/src/tool-output.ts: same 2000/50 KiB limits, spills to `tool-output/` dir, 7-day retention cleanup; core/src/file-mutation.ts uses a keyed mutex and BOM handling.
- Why for GE: GE does not run tools itself, but GE's own agent features (personas, flows, "Hizli soru", test users driving a browser, scheduled jobs) will; and GE displays other tools' huge outputs (UI side `LogView.tsx`, `LogView`). Use the same limits in the display: show head/tail with a "show all" link and keep the full text in a file/blob.
- Effort: S.

### A9. Codemode: the model writes a script that calls tools; only the script output is returned (pi MIT, opencode MIT)
- pi: packages/codemode/ (5k lines) + docs/codemode.md. QuickJS sandbox, no fs/network/timers, `tools.<name>(args)`, `Promise.all` parallel calls, `max_output_tokens` (10000) with start+end kept and full text to a temp file, `searchTools()` (BM25), `describeTool()`, `describeNamespace()` for MCP servers, `store/load` persisted in the session, `models` for classifiers/image models. Tools can be "deferred" so the prompt stays short as MCP servers connect. Nested tool calls are recorded on the parent tool result with `parentToolCallId` (core/nested-tool-calls.ts) so the UI can show them.
- opencode: packages/codemode (31k lines): own interpreter of a JS subset ("Rather than trying to sandbox arbitrary JavaScript, only runs the language features we implement"), diagnostics with source positions; core/src/codemode/{catalog,tool,instructions}.ts; plugin/mcp-codemode-defaults.ts.
- Why for GE: GE's flows (`flows.ts`), persona runs and MCP server registry could expose "one execute tool" that scripts many tools, cutting tokens and round trips for GE's own agents. Also a design for GE's MCP server (`mcp.ts`): with many tools, expose `search_tools` + `execute` instead of N definitions.
- Adopt: not before GE owns an agent loop. If it does, use pi's package (MIT) or QuickJS WASM. Effort: L. Priority: low-medium.

### A10. Context cost control: prompt-cache warming (pi, opencode; MIT)
- pi: core/cache-warmer.ts (header lines 12-35): a refresh request is sent at 90% of the cache TTL only if expected saving >= $0.05; idle sessions use probability 0.15 that the user returns; max warm age 60 min streaming / 30 min idle; logged as `usage` entries of kind `cache_warm` (docs/session-format.md "UsageEntry") so cost totals are honest.
- opencode: core/plugin/warming.ts (1-40): config `warming: true` -> keep-alive prompt "reply with exactly: OK" every 4 min for up to 30 min.
- Why for GE: GE tracks costs (`costs.ts`, Limits page). Showing "cache expires in 3:12; keep warm?" and counting cache read/write tokens separately would be unique for a monitoring suite. GE can compute it from Claude Code JSONL usage fields (cache_read/creation tokens) without driving anything. Effort: S (display), M (actually warming).

### A11. Usage accounting model (pi, MIT)
- Where: core/usage-totals.ts (input, output, cacheRead, cacheWrite, cost), docs/session-format.md "UsageEntry": usage that is not an assistant message (summaries, cache warms, branch summaries, nested tool calls) is recorded as its own entries with `kind` and added to totals. Unknown `kind` is treated as normal usage.
- Why: GE's cost figures should include helper calls (GE's own summarizer/enhancer/hallucination checks), shown separately from the tool's own spend. Check `costs.ts`/`analytics.ts`. Effort: S.

### A12. Provider abstraction and mid-session model switching (pi, MIT; opencode, MIT)
- pi packages/ai: ~30 providers under src/providers/*.ts, generated model catalog (models.generated.ts, 'update:model-catalog'), cross-provider handoff (README line ~1501: messages are transformed so a conversation can move between providers: thinking blocks, tool-call ids normalised), `transformHeaders`, OAuth flows for subscriptions (ai/src/oauth.ts, auth/). "Virtual models" (docs/virtual-models.md): a selectable "auto" model whose `route(request, ctx)` picks the physical model per request, sticky for tool follow-ups; the session records both selection and the model that actually answered.
- opencode packages/ai (80k) + core/src/models-dev.ts (model metadata from models.dev) + provider.ts, variant.ts (thinking variants), model-resolver.ts.
- Why for GE: plan 1.6 "Otomatik model yonlendirme" is the same feature as pi's virtual models; pi's interface (route returns model+thinking level, sticky on retries/tool follow-ups, footer shows `auto high -> model medium`) is a proven shape. models.dev as a free catalog of context windows and prices would feed GE's cost and "session health" calculations without hand-maintained tables.
- Adopt: use models.dev JSON (check its license/terms before bundling; fetch at runtime) in `costs.ts`; implement router as a pure function with a `reason: user|toolFollowup|retry` input. Effort: S (catalog), M (router).

### A13. Driving other CLIs / SDK / headless
- pi RPC mode: JSONL over stdin/stdout, commands prompt/steer/follow_up/abort/get_state/..., responses carry `id`, events stream asynchronously; `data.disposition` = started | queued | handled (docs/rpc-commands.md). An "extension UI sub-protocol" (docs/rpc-extension-ui.md) lets an embedding app render dialogs for extensions. Client: src/modes/rpc/rpc-client.ts, examples/rpc-client.ts. Used by OpenClaw (README).
- opencode: background server elected per machine (`opencode service status`, AGENTS.md "Live TUI Testing"); every client (TUI, web, desktop, SDK) talks the same HTTP API + SSE feed (packages/protocol/src/groups/*.ts defines groups: session, message, permission, pty, worktree, mcp, fs, vcs, ...; server/src/event-feed.ts with per-subscriber queue capacity 4096 and an explicit overflow error so a slow client is cut instead of blocking); `log.synced` marker (schema/src/event-log.ts) separates replay from live events; pairing codes for remote devices (server/src/pairing.ts: 16-byte base64url code, 5-minute TTL, single use).
- Why for GE: (1) GE could DRIVE pi through its RPC mode as a fourth adapter (`apps/server/src/adapters/`), which is cheap because the protocol is JSONL and documented, and pi supports many providers (including local llama.cpp, docs/llama-cpp.md). (2) GE could also WATCH opencode: sessions in its SQLite (packages/core/src/database/schema.sql.ts) or via its HTTP API/SSE; it has `permission.asked` events GE could surface in Inbox. (3) `log.synced` replay-then-live and bounded subscriber queues are right patterns for GE's own SSE to the web UI. (4) Pairing code is the model for linking a phone/second device to a local GE (plan 4 team hub).
- Effort: M per adapter; S for pairing code.

### A14. Project trust (pi, MIT)
- Where: docs/security.md "Understand project trust", src/core/project-trust.ts, trust-manager.ts, components/trust-selector.ts. A repo's `.pi/` (settings, MCP servers, extensions, skills, prompts, SYSTEM.md) is loaded only after the user trusts that folder; AGENTS.md/CLAUDE.md context files load regardless but are treated as untrusted input. Doc is honest that trust is not a sandbox.
- Why for GE: GE imports projects (plan 5.4) and reads `.mcp.json`, `.claude/`, hooks and skills from them. Before GE executes or registers anything from a freshly imported or cloned repo (hooks, MCP servers), show a one-time trust prompt. Matters for the "learning center / templates / team repos" flows where code comes from others.
- Effort: S-M (`projects` import flow + `mcpservers.ts`).

### A15. Skills, prompt templates, plugins (pi, MIT; opencode, MIT)
- pi: Agent Skills spec (docs/skills.md): `SKILL.md` + frontmatter, name+description in prompt, body loaded on demand, `/skill:name` to force, `disable-model-invocation`. Packages (docs/packages.md) distribute extensions/skills/themes via npm/git. Extensions (docs/extensions.md; types in src/core/extensions/types.ts) = TS modules with events `tool_call` (can block), `tool_result`, `turn_start`, `agent_settled`, `session_before_fork`, `session_before_compact`, ... plus `registerTool/Command/Shortcut/Provider/VirtualModel/EntryRenderer`, UI primitives `ctx.ui.select/confirm/notify`, widgets, overlays. About 70 examples in examples/extensions/ (todo.ts, plan-mode/, subagent/, handoff.ts, summarize.ts, ssh.ts, sandbox/, git-merge-and-resolve.ts, structured-output.ts, ...).
- opencode: plugin API in packages/plugin (Promise and Effect flavours), hooks like `tool.hook("execute.before")`, `model.request`, session hooks; core plugins are first-party (plugin/ folder: tool-input-repair, warming, plan.ts, verbosity.ts, optimize.ts, websearch/, skill/, system-prompt/). GUI extensions (packages/gui-extensions/README.md, lines 1-80): every non-core desktop feature (terminal, review, files, browser, SSH, WSL, updater, pairing) is an extension with a manifest (`id`, `provides`, `uses`, `requires`, `stores`, `i18n`), contracts as tokens, a registry (`ctx.add(Registry, item)`), and compile-time errors for undeclared dependencies.
- Why for GE: GE already has `plugins.ts` (+test) and a persona system. pi's lesson: first-party features written against the same hook API prove the API (opencode does this). opencode's gui-extensions manifest (provides/uses/requires, lazy heavy UI) is a good shape for GE's web UI sections (Terminal, Files, Preview, Servers) if GE wants community add-ons. pi's skills are the same open standard as Claude Code skills, so GE can surface/own them (learning center, personas) with zero format invention.
- Effort: L for a full extension host; S to adopt the Agent Skills format for personas' knowledge files (check `personas.ts`).

### A16. Multi-agent / subagents (pi example, opencode core; MIT)
- pi: examples/extensions/subagent/ (index.ts, agents.ts, agents/{scout,planner,reviewer,worker}.md, prompts/{implement,scout-and-plan,implement-and-review}.md). Each subagent is a separate `pi` process with its own context; agent definitions are Markdown with frontmatter (`name, description, tools, model`) and a system prompt body; modes single / parallel / chain; per-agent usage (turns, tokens, cost) streamed; Ctrl+C kills children. The scout prompt shows a good "compressed handoff" format: files with exact line ranges, key types, risks.
- opencode: core/src/session/subagent-job.ts, subagent-completion.ts, job.ts (background jobs that outlive the launching plugin; one completion observer per job generation, with de-dup keys), session `parentID` so child sessions share the parent's provider-cache affinity (session/affinity.ts: `parentID ?? fork.sessionID ?? id`), packages/app/src/session/timeline/background-work.stories.tsx (UI for background subagent work).
- Why for GE: GE personas (plan 6) are "expert agents"; pi's Markdown agent format (frontmatter + prompt) and the scout/planner/reviewer/worker set are a ready-made starter library for GE personas and "flows" (plan 8: implement = scout -> planner -> worker). Parent/child session linkage in the chat list (nest child sessions under the parent) is a UI gap to check in GE's `Chat.tsx`.
- Effort: S (import the four agent prompts as built-in personas, MIT with attribution), M (parent/child grouping).

### A17. MCP (pi MIT, opencode MIT)
- pi packages/mcp (4.9k lines) + docs/mcp.md: stdio and streamable HTTP only (SSE rejected), user file `~/.pi/agent/mcp.json` and project `.pi/mcp.json` (project only after trust; same-name project entry replaces user entry; entry with only `enabled/exposure` overrides parts of the user entry); `${ENV}` expansion in headers/env; OAuth sign-in; `description` per server is placed in the system prompt; tool naming `mcp__<server>__<tool>`; `exposure` modes incl. deferred + tool search so many servers do not bloat the prompt; `pi mcp add/list` CLI.
- opencode core/src/mcp/{client,oauth,stdio,instructions,index}.ts, tool/mcp.ts, TUI sidebar/mcp.tsx status.
- Why: GE has `mcpservers.ts` (+test) and `mcp.ts`. Borrow: user-vs-project layering with override semantics, per-server enable/disable per project, deferred exposure/tool search, server `description`, status panel with reconnect/sign-in. Effort: M.

### A18. Remote execution (pi MIT)
- packages/env: `pi-env` Rust daemon on the remote host, framed protocol over SSH stdin/stdout (docs/protocol.md), deployed by SHA-256 with verification before every start, host-key fingerprint confirmation out of band (`scanHostKey`/`acceptHostKey`), `RemoteExecutionEnv` giving the same semantics as local (docs/semantics.md). Credentials and storage stay on the local machine.
- Why for GE: plan 2.5 "Sunucular (SSH)" and 1.2b "Lokal/Sunucu/Takim" environments. The ideas to copy: hash-pinned helper deployment, explicit host-key accept step, "remote results must match local" test suite. Effort: L (idea only; the daemon is Rust and GE has `servers.ts`).

### A19. Durable runtime and hot reload (pi, MIT; experimental)
- packages/durable (66k lines): "conversations, model turns, tool calls are committed to storage before anything is shown; if the process dies mid-turn, reopening picks the work up." packages/chord: objects at addresses with replicated JSON state, snapshot + delta to viewers, hot reload that keeps in-flight work on old code. Architecturally interesting for a server that survives restarts, but marked experimental ("API changes without notice").
- Why for GE: GE's server already stores in SQLite; the takeaway is the commit-before-display rule for scheduled jobs/flows (`jobs.ts`, `schedules.ts`, `flows.ts`) so a crash mid-run resumes instead of restarting. Effort: M (pattern), do not adopt the packages.

### A20. Session storage formats
- pi: append-only JSONL tree per session (docs/session-format.md); entries message / model_change / thinking_level_change / compaction / branch_summary / context_edit / usage / custom; system prompt + tool declarations stored as patches inside the session (first request persists everything, later changes as `sections` patches with `toolsAdded/Removed`), so a replay shows exactly what the model saw.
- opencode: event-sourced SQLite (core/src/database/schema.sql.ts, session/projector.ts 810 lines projects events into message rows; session/message-updater.ts; session/transfer.ts moves sessions between locations; durable event manifest packages/schema/src/durable-event-manifest.ts).
- Why for GE: "what exactly did the model see" is the root of GE's hallucination checks (plan 1.8-1.9). Persisting the system prompt/tools/instruction files per run (as pi does) lets GE explain a bad answer. GE cannot get this from Claude Code JSONL fully, but it can record the `CLAUDE.md`/instructions hash and tool list at session start. Effort: S-M.

### A21. Instruction discovery (opencode MIT; pi MIT)
- opencode core/src/instruction-discovery.ts, session/instruction-state.ts (274 lines) track which instruction files (AGENTS.md etc.) are loaded in a session and re-inject changed ones; pi loads AGENTS.override.md / AGENTS.md / CLAUDE.md up the tree (docs/security.md, system-prompt.ts).
- Why: GE could show per session "instruction files in effect" and warn when two tools read different files (CLAUDE.md vs AGENTS.md), supporting plan 15 (quality gate). Effort: S.

### A22. Enterprise/managed policy (opencode MIT)
- core/src/managed-policy.ts: policy statements compiled by an org console and applied to config/catalog (e.g. which models are allowed), with org name in denial messages.
- Why: GE Team security (`TeamSecurity.tsx`, plan 4.2-4.3) could push a "policy" (allowed models, forbidden commands, required review) to members. Idea only. Effort: L.

---------------------------------------------------------------------------------------------------

## 4. Code quality and performance ideas

### Q1. Record/replay HTTP cassettes for provider tests (opencode, MIT)
- packages/http-recorder (README): record real HTTP/WebSocket traffic once, replay from deterministic JSON cassettes. For GE: tests for adapters that call outside services (limits fetchers, update checks, summarizer to real APIs, `webhooks`) without hand-written mocks. Library depends on Effect beta, so copy the idea, not the package. Effort: S-M with a small fetch wrapper in `apps/server/src/fixtures/`.

### Q2. Behavioural evals with "docs lift" (pi, MIT)
- packages/evals (README): vitest-evals; `*.docs.eval.ts` runs each case in two isolated containers (with and without docs) and reports the lift; host evals for smoke tests. For GE: evaluate whether GE's generated prompts (Prompt Enhancer, plan 4.5), persona prompts and summaries actually improve results: run N cases with/without. Also a way to test the learning-center content. Effort: M.

### Q3. Layered architecture enforced by tests (opencode, MIT)
- AGENTS.md lines 1-4 (dependency direction), `packages/session-ui/src/import-boundaries.test.ts` (a test that fails if a UI package imports forbidden modules). For GE: a boundaries test (`apps/web` must not import `apps/server`; `@godeye/core` must stay dependency-light). Also fits plan 15.2 "Mimari Uygunluk". Effort: S.

### Q4. Pure projection functions with heavy unit tests (opencode, MIT)
- timeline/projection.ts (1057 lines) + projection.test.ts (366) + rows-current.test.ts (1518): the chat view is a pure function from message list to rows; "reuseTimelineRows" keeps row object identity between updates so UI diffing stays cheap (projection.ts line ~100). Lenient decoding: "a field of the wrong type decodes as absent, so one bad field does not discard its neighbours" (projection.ts lines 41-44) - exactly what GE needs when parsing JSONL written by different tool versions. Effort: S (lenient decode helper), M (projection structure).

### Q5. Keep UI primitives small, state machines pure, stories for each state (opencode)
- See U4 and U13. Tests sit beside code (`*.test.ts`).

### Q6. Smaller points
- pi `core/output-guard.ts`: takes over stdout so stray writes by libraries cannot corrupt the JSONL protocol; relevant if GE ever speaks a stdio protocol.
- pi `core/tools/output-accumulator.ts` (257 lines): bounded streaming accumulation of command output (head/tail windows) - use in `terminals.ts`/log capture to bound memory.
- chord `output` module: `OutputBuffer` (head/tail window), `Progress` (adaptive commits of a changing value) - paced progress updates; a pattern for throttling SSE updates of token counters.
- pi `core/crash-log.ts`, `bug-report*.ts`: one-command bug report with redaction; GE has `feedback.ts`/`apperrors.ts`.
- opencode `perf/test-suite.md` documents perf test suites; opencode `STATS.md`/packages/stats: public usage stats site (not relevant).
- opencode `packages/core/src/ripgrep.ts`, `formatter.ts` (runs project formatters after edits), `persistent-pty.ts`: PTYs that survive client disconnects (GE `terminals.ts` likely similar; verify reconnect with scrollback replay).

---------------------------------------------------------------------------------------------------

## 5. Features GE does not appear to have at all (check before building)

1. Conversation tree with edit-and-retry and branch summaries (pi /tree, /fork, /clone). [A2]
2. Visible steer vs follow-up queue for messages typed during a run. [A3]
3. Timeline detail presets that collapse tool calls into summary rows. [U2]
4. Line comments on diffs fed back into the next prompt. [U3]
5. Session export to a single HTML file. [U11]
6. Pi as a 4th adapter (RPC JSONL) and opencode as a 5th (HTTP/SSE or SQLite). [A13]
7. Project-trust prompt before importing hooks/MCP/skills from a repo. [A14]
8. "Allow always" persisted rules and reject-with-feedback. [A4]
9. Prompt-cache TTL display and keep-warm. [A10]
10. Models.dev-backed catalog of windows and prices. [A12]
11. Web Locks notification de-duplication. [U5]
12. Reopen closed tab, searchable settings, rebindable shortcuts. [U8]
13. Pairing code to attach a second device. [A13]
14. Codemode for GE's own agents/MCP server. [A9]
15. Docs-lift evals for prompts. [Q2]

---------------------------------------------------------------------------------------------------

## 6. Top 15 for God Eye (impact x effort)

| # | Item | Impact | Effort | Licence | Where in GE |
|---|------|--------|--------|---------|-------------|
| 1 | Handoff/summary prompts from pi + opencode compaction (A1) | High: better handoffs, recaps, session health | S | MIT (both) | `apps/server/src/summarizer.ts`, `RecapCard.tsx` |
| 2 | Block-wise streaming markdown with remend (U1) | High: smooth long chats | S-M | MIT (opencode) | `apps/web/src/components/Markdown.tsx` |
| 3 | Timeline detail presets and grouped tool summaries (U2) | High: beginner vs expert views | M | MIT (opencode) | `pages/Chat.tsx`, `lib/timeline.ts` |
| 4 | Steer vs follow-up message queue (A3) | High: real use while agent runs | M | MIT (both) | `chat-routes.ts`, composer |
| 5 | "Allow always" rules + reject with feedback + per-project auto-approve with reconnect sweep (A4, U6) | High: fewer approval prompts, safer | M | MIT (opencode) | `guards.ts`, `ApprovalCard.tsx` |
| 6 | Pi adapter via RPC JSONL, opencode adapter via HTTP/SSE (A13) | High: more tools watched/driven | M each | MIT (both) | `apps/server/src/adapters/` |
| 7 | Built-in personas from pi subagent agents scout/planner/reviewer/worker (A16) | Medium-high, quick win | S | MIT (pi, keep attribution) | `personas.ts`, `flows-builtin.ts` |
| 8 | Diff line comments sent to the agent (U3) | High for review workflow | M | MIT (opencode) | `DiffView.tsx`, composer |
| 9 | Message-linked checkpoints + undo of restore (A5) | Medium-high | S-M | MIT (opencode ideas) | `checkpoints.ts`, `CheckpointRestore.tsx` |
| 10 | Project trust prompt on import (A14) | Medium-high (security) | S-M | MIT (pi) | project import, `mcpservers.ts`, `hooks.ts` |
| 11 | Conversation tree: "edit and retry from here" (A2) | High but larger | L (M for linear retry) | MIT (pi) | `chats.ts`, `Chat.tsx` |
| 12 | Composer reducer, shell mode, per-mode history, @file mentions (U4) | Medium | M-L | MIT (opencode) | `HomeComposer.tsx`, `SlashMenu.tsx` |
| 13 | Tool-input repair + retry policy (A6, A7) | Medium | S | MIT (opencode) | `mcp.ts`, `localmodel.ts`, `summarizer.ts` |
| 14 | Cache TTL display and cost model with `kind` usage entries and models.dev catalog (A10-A12) | Medium | S-M | MIT (pi/opencode) | `costs.ts`, Limits page |
| 15 | HTML session export (U11) and multi-tab notification lock (U5) | Medium | M / S | MIT (pi, opencode) | server export route, `lib/notifyOnce.ts` |

Runner-ups: in-chat search and message deep links (U7), searchable settings and reopen-closed-tab (U8), http-recorder idea (Q1), docs-lift evals (Q2), boundaries test (Q3), lenient decoding (Q4), outputs truncation limits (A8), MCP layering/deferred exposure (A17).

## 7. Notes on what NOT to copy
- pi has no permission system and says so; do not copy its "trust the user" model for GE's approvals.
- pi durable/chord are experimental and large; take patterns only.
- opencode V2 is Effect 4 beta + Solid + OpenTUI; code is not directly portable to GE's React/Hono stack. Copy algorithms (stream blocks, permission evaluate, tool-input repair, retry schedule, snapshot design) rewritten in plain TS, keeping the MIT notice and naming the origin file in a comment.
- Both repos move quickly; line numbers refer to the commits above only.
