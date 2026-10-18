# Notes: t3code (pingdotgg/t3code, "T3 Code v2") for God Eye

Reader: God Eye maintainer. All paths below are relative to the t3code repo root unless they start with
`God Eye:`. Line numbers are from the commit I read. License of everything quoted: MIT (see section 1),
so code may be reused with attribution (copyright notice "T3 Tools Inc."), but see the caveat on Effect-TS
coupling in section 1.

---------------------------------------------------------------------------------------------------

## 1. Overview

- What it is: "an agent harness control surface". A Node server wraps the user's installed provider CLIs/SDKs
  (Claude Code via the Claude Agent SDK, Codex via `codex app-server` JSON-RPC, Cursor, Grok Build, OpenCode,
  Pi, Antigravity, Muse, and any ACP-registry agent) and serves web, Electron desktop and React Native
  mobile clients over typed WebSocket RPC. It is explicitly "bring your own subscription". AGENTS.md says
  500,000+ users.
- Repo: https://github.com/pingdotgg/t3code, branch default, depth-1 clone.
- Commit read: `6a6ebb278dc70dd859439a3c28960a7d23a1e645`
- License: MIT, "Copyright (c) 2026 T3 Tools Inc." (`LICENSE`, line 1-3). MIT = reusable with attribution.
  Third-party deps are listed in `third-party-licenses.config.json`; I did NOT audit them (for example
  `@pierre/diffs`, `@pierre/trees`, `@legendapp/list`, `libghostty-vt` have their own licenses: check before
  depending on them).
- Size (TS/TSX only, counted by me with find+wc):
  - apps/server 1204 files, 486k lines (event-sourced orchestrator, 11.6k-line `Orchestrator.ts`,
    9.2k-line `ClaudeAdapterV2.ts`, 7.3k-line `CodexAdapterV2.ts`; very test-heavy: the Claude adapter
    test file alone is 14k lines)
  - apps/web 1530 files, 372k lines (`ChatView.tsx` 8.7k, `ChatComposer.tsx` 7.4k, `MessagesTimeline.tsx` 5.6k,
    `ChatMarkdown.tsx` 3.4k)
  - apps/mobile 1154 files, 175k lines (Expo 58 / React Native, Uniwind theming)
  - apps/desktop 270 files, 83k lines (Electron shell, SnapShot capture, SSH, WSL, updater)
  - packages/client-runtime 343 files, 88k lines (connection supervisor, Effect Atom state, work-log presenters)
  - packages/contracts 107 files, 33k lines (Effect Schema wire contracts, the only thing that crosses the wire)
  - packages/shared 217 files, 44k lines; provider-* (core, acp, acp-registry, cursor, grok, muse,
    opencode, pi) about 100k lines; effect-codex-app-server 62k (generated protocol), effect-acp 28k;
    source-control-* (github, gitlab, bitbucket, azure-devops, forgejo, gitcafe) about 54k; ssh, tailscale.
  - infra/relay (Cloudflare Worker + Durable Objects, "T3 Connect"), native/ (Rust resource monitor,
    libghostty-vt, Wayland/KDE snap-shot helpers, browser-secret helper).
- Stack: TypeScript everywhere, Effect-TS (`effect` v4 "smol" beta, Schema, Layer, Stream) on the server and
  in client-runtime, React 19 + Vite + Tailwind 4 + Base UI + TanStack Router + Tiptap + Zustand + Effect
  Atom on the web, "Vite+" (`vp`) as the one toolchain, oxlint with a custom plugin, knip for dead code,
  pnpm workspaces. No Hono/Bun.
- Caveat for reuse: the server code is written against Effect (`Effect.fn`, `Layer`, `Context.Service`,
  `Schema.TaggedError`). Copying files into God Eye (Bun + Hono, no Effect) is not practical; the realistic
  path is to re-implement the PATTERNS and copy small pure files (markdown-incremental, incrementalHighlighting,
  lruCache, load-balancing, htmlRender theme variables, commandLabel/presentation helpers once their
  Effect-free types are stubbed). Pure web helpers are the easy wins.
- Where God Eye already matches: hidden-ref checkpoints (God Eye `apps/server/src/checkpoints.ts` uses the same
  throwaway-index trick), worktrees, approvals, scheduled jobs, MCP server config, Shiki highlighting
  (God Eye already depends on `shiki 4.5.0` and uses `marked` + DOMPurify), Mermaid, command palette,
  Inbox/snooze. Those are marked "already have" below, with only the delta noted.

### Architecture in one picture (from AGENTS.md, docs/internals/overview.md, docs/orchestration-v2/README.md)

```
client (web/desktop/mobile)  --typed WS RPC (packages/contracts/src/rpc.ts)-->  server (apps/server)
  commands -> Orchestrator (pure decider, 11.6k lines, no IO)
           -> EventSink: ONE sqlite transaction = events + projections + command receipt + outbox effects
           -> EffectWorker (drains outbox: provider-turn.start/steer/interrupt/restart, checkpoint.capture, ...)
           -> ProviderSessionManager -> ProviderAdapterV2 (one per driver) -> CLI/SDK subprocess
           <- adapter normalizes native frames into ProviderAdapterV2Event -> ProviderEventIngestor -> commands/events
  read side: snapshotSequence cursor + live events (sequence > N); shell stream (sidebar) and thread stream
```

Vocabulary worth stealing (docs/internals/glossary.md): Environment, Project, Thread (durable, survives
process exits), Turn/Run, Activity, Provider vs Driver vs Provider instance, Adapter, Session, Runtime mode
(permission policy) vs Interaction mode (plan/default), Checkpoint, Command / Event / Projection / Command
receipt / Outbox effect.

---------------------------------------------------------------------------------------------------

## 2. Package and app map (what each part does)

| Path | Role |
| --- | --- |
| `packages/contracts/src/orchestrationV2.ts` (3631 lines) | Every durable entity, turn item type, domain event, command and RPC schema. Forward-compatible unions (`kindUnionWithFallback`, `ForwardCompatibleArray`, `OrchestrationV2UnknownThreadStreamEvent`) so old clients survive new servers. |
| `packages/contracts/src/rpc.ts` (2051) | RPC method list with required scopes (`CLIENT_GUARDED_RPC_SCOPES`). |
| `packages/provider-core/src/server/ProviderAdapter.ts` | The adapter interface: `openSession`, `ensureThread`, `resumeThread`, `startTurn`, `steerTurn`, `interruptTurn`, `respondToRuntimeRequest`, `readThreadSnapshot`, `rollbackThread`, `forkThread`, `compactThread`, `stopSubagent`, `injectHistory`, `mcpApps`, plus capability flags. Events out: `provider_session/thread/turn.updated`, `node.updated`, `turn_item.updated`, `command_output.delta`, `runtime_request.updated`, `plan.updated`, `turn.terminal`. |
| `apps/server/src/orchestration-v2/Adapters/` | `ClaudeAdapterV2` (Agent SDK `query()`), `CodexAdapterV2` (app-server JSON-RPC), ACP (generic + registry), Cursor, Grok, Pi, OpenCode (1.x and 2.x), Antigravity, Muse. Each has a `.testkit.ts` that replays recorded transcripts. |
| `apps/server/src/orchestration-v2/` | Orchestrator, EventSink/EventStore, EffectOutbox/EffectWorker, CheckpointService/Capture/Rollback/RestoreSafety, ContextHandoffService, ThreadForkService, ProviderSwitchService, ThreadSettlementService, QueuedRunOrder, CommandOutputHub, LiveStreamBudget, ThreadLiveEventCoalescer, ThreadSearch/ThreadFind, PullRequestSyncReactor. |
| `apps/server/src/mcp/` + `mcp/toolkits/*` | The app's own authenticated MCP server (`/mcp`, key `t3-code`): orchestrator (delegate_task, threads), preview (browser), device (simulators), html (html_render), project, worktree, pullRequests, attachment, environment. Per-provider-session credentials in `McpSessionRegistry`. |
| `apps/server/src/{vcs,git,pullRequest,sourceControl}` | Git driver with checkpoint ops, PR sync, GitHub/GitLab/Bitbucket/Azure/Forgejo/GitCafe clients. |
| `apps/server/src/usage/` + `provider/*UsageLimits.ts` | Reads each CLI's own transcripts on disk to compute tokens/cost, plus plan-limit probes. |
| `apps/server/src/scheduledTasks/` | Interval / fixed-time / webhook-triggered agent runs; relay holds webhooks while offline. |
| `apps/server/src/preview/`, `htmlRender/` | Collaborative browser (agent and user share a tab), headless-Chrome screenshots, HTML visual replies. |
| `apps/server/src/terminal/` | PTY manager with bounded scrollback; web renders with `libghostty-vt` WASM. |
| `apps/web/src/components/chat/` | Timeline (virtualized), composer (Tiptap), banners, approvals, plan card, context meter, find bar, minimap. |
| `apps/web/src/components/ui/` | Base UI + Tailwind primitives, forced variants (lint rule `shadcn/no-restyle`). |
| `packages/client-runtime` | One connection supervisor/registry per environment, snapshot+cursor state, thread history paging/merge, work-log presenters shared by web and mobile. |
| `infra/relay` | "T3 Connect": hosted broker for discovery/tunnels/push notifications; not in the data path. |
| `oxlint-plugin-t3code/rules` | 20+ custom lint rules encoding house rules (see C-section). |

---------------------------------------------------------------------------------------------------

## 3. Findings

Format: ID, title. `Where` = path in t3code (lines). `What` = what it does. `Why` = why it matters for God
Eye. `Adopt` = how, in which God Eye file. `Effort` = S/M/L. `License` = MIT for all (t3code), noted once.

### A. UI / UX

**U1. Incremental markdown parsing for streaming messages**
- Where: `apps/web/src/markdown-incremental.ts` L1-107 (core L28-80); used from `apps/web/src/components/ChatMarkdown.tsx`
  (imports `createIncrementalMarkdownPlugin`, L112).
- What: a unified/remark parser plugin that caches the parse of the completed prefix. A "parsing boundary" is a
  closed top-level fenced code block followed by a blank line; on each token only the suffix is re-parsed,
  cached nodes are `structuredClone`d back in (remark transforms mutate). Falls back to a full parse on any CR,
  BOM, or link/footnote definitions (document-wide). One cache per streaming renderer.
- Why: God Eye's `apps/web/src/components/Markdown.tsx` re-runs `marked` + DOMPurify + a DOM "enhance" pass
  over the whole message on every delta. Long answers with big code blocks will jank.
- Adopt: God Eye uses `marked`, not remark, so copy the IDEA: split the text at the last closed fence + blank
  line, memoise the HTML (and the Shiki output) of the stable prefix, only re-render the tail. Add a perf
  test. Effort: S (idea) or M (switch to react-markdown + remark-gfm like T3, which also gives per-node
  React components instead of the post-render DOM patching that `enhanceCode` does today).
- License: MIT.

**U2. Incremental Shiki highlighting with grammar state**
- Where: `apps/web/src/lib/incrementalHighlighting.ts` L14-70; consumer `ChatMarkdown.tsx` L1105-1200
  (`UncachedShikiCodeBlock`, `use(getSyntaxHighlighterPromise(language))`).
- What: while a code fence streams, highlight only whole new lines and pass the previous `grammarState`
  (Shiki `getLastGrammarState`) so tokenization continues correctly; keeps the highlighted children of the
  stable prefix. Plain text/ANSI/CR input takes the full path. Finished blocks go into an LRU
  (`apps/web/src/lib/lruCache.ts`, 500 entries / 50 MB, constants at `ChatMarkdown.tsx` L363-372) keyed by
  code+language+theme, and the cache is skipped while streaming so a text selection is not wiped.
- Why: God Eye already uses Shiki (`apps/web/src/lib/highlight.ts`); this removes re-tokenizing the whole fence per
  token and the flash on completion.
- Adopt: copy `incrementalHighlighting.ts` almost verbatim (it only depends on a Shiki highlighter's
  `codeToHast` + `getLastGrammarState`) into God Eye `apps/web/src/lib/`, and `lruCache.ts` (60 lines, no deps).
  Effort: S.
- License: MIT.

**U3. Fence meta: file title, GitHub alerts, Mermaid, copy as markdown**
- Where: `ChatMarkdown.tsx` `extractFenceTitle` (L~455-470; accepts `title=`, `file=`, or a bare filename token
  in the info string), `GITHUB_ALERT_PRESENTATIONS` (L~395-440: Note/Tip/Important/Warning/Caution with lucide
  icons and colors), `isClosedCodeFence` (L~480, careful about regex backtracking on `> ` quote prefixes),
  Mermaid via `components/chat/MermaidDiagram.tsx` (lazy `import("mermaid")`, serialised renders because
  `mermaid.initialize` mutates global config, a 64-entry promise cache that never evicts pending renders so
  `use()` gets the same promise, retry only on chunk-load errors, and a DOMPurify pass that strips `href`,
  `img`, `script`, remote `url()` in CSS from the SVG L1-80).
- Why: God Eye has `Mermaid.tsx` and callouts (`callout` words in `Markdown.tsx`), but the sanitiser rules and
  "render queue + no-evict pending cache" are cheap hardening. Fence titles show the filename above the code.
- Adopt: God Eye `components/Mermaid.tsx` and `Markdown.tsx` `enhanceCode`. Effort: S.
- License: MIT.

**U4. Work log: grouped tool calls with a one-line sentence summary**
- Where: `packages/client-runtime/src/work-log/presentation.ts` `summarizeToolGroup` L631-715,
  `toolGroupAction` L417-463, `liveThoughtLine` L744-756; shell command humanising in
  `work-log/commandLabel.ts` (1436 lines, parses shell with `unbash` to strip `bash -lc`, `sudo`, `env`, PowerShell
  wrappers and derive a short program label); web rows in `components/chat/WorkLog.tsx` L1-171.
- What: consecutive tool calls collapse into one expandable row whose title is a sentence generated from the
  classified actions: "Read 3 files, edited 2 files and ran 4 commands" (max two named categories, then
  "Performed N other actions"; commands/edits beat reads; failures flagged). While the model thinks the row shows
  the first bold heading of the reasoning (`liveThoughtLine`). Details (`WorkLogDetails`) cap at `max-h-96`
  and auto-follow output only while the user is within 4 px of the bottom (`LIVE_EDGE_PX`, L~130).
- Why: this is the most visible reason T3 chats feel calm. God Eye's chat renders tool cards individually
  (`apps/web/src/pages/Chat.tsx`, `ApprovalCard.tsx`); on a 200-tool turn that is a wall of cards.
- Adopt: write `toolGroupSummary(entries)` in a new `apps/web/src/lib/workLog.ts` fed by the tool names God
  Eye already sees from Claude/Codex/Gemini adapters (`apps/server/src/adapters/*.ts`). Classification table:
  `shared/src/toolActivity.ts` (471 lines, `classifyToolActivity`). The shell-wrapper stripping is worth
  porting as a small function (do not port all 1.4k lines). Effort: M.
- License: MIT.

**U5. Approvals live in the composer, with provider-supplied options**
- Where: `components/chat/ComposerPendingApprovalPanel.tsx`, `ComposerPendingApprovalActions.tsx` L29-35 (default
  options Cancel / Decline / "Always allow this session" / Approve, primary buttons plus overflow menu, per-option
  `warning` tooltip), `ComposerPendingUserInputPanel.tsx` (multi-question wizard, option shortcuts, auto-advance
  timer, optimistic selection, collapse), `ProposedPlanCard.tsx`, `ComposerPlanFollowUpBanner.tsx`.
- What: when a request is pending, the composer area is REPLACED by the request (kind label, "1/3" counter, the
  exact command in a scrollable monospace box, buttons). `responseCapability === "not_resumable"` shows
  "Provider process is gone, interrupt or restart the run to respond" instead of dead buttons. Options come
  from the provider (`ProviderApprovalOption[]`), so Codex/Grok/Claude can offer different choices
  ("Allow all edits this session" for Grok file changes only).
- Why: God Eye's `ApprovalCard.tsx` (62 lines) is a card in the timeline. The composer-takeover pattern keeps
  the decision where the eyes and keyboard already are, supports a queue of approvals, and handles the "process
  is gone" state that otherwise shows broken buttons after a restart.
- Adopt: God Eye `ApprovalCard.tsx` + `pages/Chat.tsx`: render pending approvals docked above/in the composer,
  add "allow for this session" and the not-resumable state, show N/M. Effort: M.
- License: MIT.

**U6. Plan mode UX: capture ExitPlanMode, plan card, "Plan Ready" status**
- Where: server `ClaudeAdapterV2.ts` L7831-7850 (see A3), web `ProposedPlanCard.tsx` (collapsed preview to 10 lines
  when >900 chars or >20 lines, copy, download .md, "save to workspace" dialog), `proposedPlan.ts`,
  sidebar pill "Plan Ready" in `components/Sidebar.logic.ts` L1134-1146.
- Why: God Eye `pages/Chat.tsx` already mentions plan cards; check the three delta items: collapse/preview,
  save-to-file, and the sidebar/inbox status "Plan Ready" so a finished plan is not missed.
- Adopt: `Chat.tsx`, `Inbox.tsx`. Effort: S.
- License: MIT.

**U7. Thread status pill priority list**
- Where: `components/Sidebar.logic.ts` `resolveThreadStatusPill` L1080-1160 (first match wins: Pending Approval
  (amber) > Awaiting Input (indigo) > Working (sky, pulse) > Connecting (starting/queued) > Waiting (background
  work) > Plan Ready (violet) > Completed (only if unseen, via `lastVisitedAt`)); `ThreadStatusIndicators.tsx`
  adds terminal-running and PR badges; shell contract `OrchestrationV2ThreadShell`
  (`contracts/src/orchestrationV2.ts` L1792-1865) carries `pendingRuntimeRequest`, `hasActionableProposedPlan`,
  `pendingBackgroundTasks`, `latestVisibleMessage`, `lastVisitedAt`, `usageLimitResetAt`, `lastErrorClass`.
- Why: the sidebar answers "which of my 12 agents needs me?" without opening anything. God Eye has Inbox and
  session lists but no single ranked status vocabulary.
- Adopt: define the same ordered list in `packages/core` and use it in the session list, Inbox, tab title badge
  and favicon. Effort: S-M.
- License: MIT.

**U8. Sidebar organisation: pin / active / working / settled / snoozed with drag between sections and Undo**
- Where: `docs/user/thread-sidebar.md`; `components/Sidebar.tsx`, `Sidebar.drag.ts`, `SidebarThreadUndoNotice.tsx`,
  `CustomSnoozeDialog.tsx`; server `ThreadSettlementService.ts` (637 lines), commands `thread.pin/unpin/settle/
  unsettle/snooze/unsnooze/auto-settle`, order keys `pinOrderKey`/`activeOrderKey` (fractional keys, server-saved).
- What: finished work leaves the active list ("Settle"), automatically after 3 days idle or when its PR merges,
  never while approvals/background work are pending; snooze until a time or until a rate limit resets;
  every action shows a 5 s toast with Undo and `mod+z`; dragging a row onto a section header performs the
  action and the dragged ghost shows the verb ("Pin", "Settle", "Wake"). "Working" section collapses running
  threads (beta).
- Why: God Eye has snooze in Inbox (`lib/snooze.ts`) but sessions only have a flat list. The settle model
  scales to many parallel agents.
- Adopt: God Eye `pages/Project.tsx` / Shell session list + a small `session_state` table; auto-settle job in
  `apps/server/src/schedules.ts`. Effort: M-L.
- License: MIT.

**U9. Composer: rich-text Tiptap, inline context chips, attachments, paste rules, stash, history recall**
- Where: `components/ComposerPromptEditorTiptap.tsx`, `docs/internals/composer-editors.md`,
  `docs/internals/composer-context-references.md`, `docs/user/composer.md`, `promptStashStore.ts`,
  `composerPromptHistory.ts`, `components/chat/ComposerImageThumbnail.tsx`, `lib/attachmentUploadQueue.ts`.
- What and rules worth copying: (1) message limit 120,000 chars; a paste >= 32 KiB becomes a text-file attachment
  (Ctrl+Shift+V keeps it inline). (2) Up to 100 attachments, images 10 MiB (80 MiB total), others 50 MiB; uploads
  start on add and send is blocked until all finish; failed uploads show Retry/Remove; HEIC converted to JPEG,
  oversized photos resized client-side (`heic-to`, `lib/imageCompression.ts`). (3) Chips inside the text: a
  chip is the markdown link `[label](t3-context://v1/<kind>/<id>)`; the payload (terminal excerpt, review comment,
  picked page element, preview annotation, PR, thread, file, skill) lives in `message.context.records`; the
  provider sees `[Image: shot.png; ref=ctx_1]` markers plus a trailing `<t3_context version="1">` envelope with
  `<` escaped so captured text cannot forge records. (4) `@` picks another thread (agent reads its history on
  demand, cost zero until read), `#` picks a PR, `/` commands, `$` skills. (5) ArrowUp in an empty composer
  recalls sent prompts; Cmd/Ctrl+S stashes the draft with attachments (24 h retention); "Cite in composer" on a
  selected assistant passage creates a quote chip with an optional comment; "Edit from here" rewinds the
  conversation to before a message (optionally restores files when in a worktree).
- Why: God Eye has `HomeComposer.tsx`, `SlashMenu.tsx`, `PromptPicker.tsx`, `MicButton.tsx`, but no chips, no
  quote-reply, no history recall, no stash. The `t3-context` envelope idea fits God Eye's hallucination
  checks: structured, typed context instead of pasted blobs.
- Adopt: incremental. S: paste-to-attachment threshold, ArrowUp recall, stash (`lib/` + localStorage, then
  server). M: quote/cite chip. L: full Tiptap chips. Do not copy the Tiptap editor wholesale; its doc has
  7k lines of edge cases.
- License: MIT.

**U10. Queue vs steer while the agent is working**
- Where: `docs/user/composer.md` "Send while the agent is working", `docs/orchestration-v2/feature-lifecycles.md`
  L61-118, server `QueuedRunOrder.ts`, `DispatchModeLimit.ts`, commands `queued-run.edit/reorder/cancel`,
  `queued-message.promote-to-steer`, `queue.resume`; web `QueuedRunsControl.tsx`, `queuedMessageEdit.ts`.
- What: Enter while a run is active either QUEUES (new run after) or STEERS (change the active run). Default is a
  setting; Cmd/Ctrl+Enter does the opposite for one message; Cmd/Ctrl+Shift+Enter promotes the oldest queued
  message to a steer. If the provider cannot steer natively the app interrupts and restarts the turn under the
  same run id (a new "attempt"). Queued messages are persisted server-side, can be edited/reordered/removed,
  and after a server restart they are HELD until the user presses Resume.
- Why: God Eye has no steer/queue (grep found none). Users of Claude Code TUI do this constantly (type while it
  works).
- Adopt: God Eye `chats.ts` + `chat-routes.ts` (server-side queue table), `HomeComposer`/`Chat.tsx` UI; for Claude
  Code driven through the CLI, steering = send as a new user message in the streaming-input channel; for tools
  that cannot, interrupt + resend with context. Effort: M.
- License: MIT.

**U11. Banner stack above the composer**
- Where: `components/chat/ComposerBanner.tsx` (slot components: Root with `variant` and density, Title,
  Description, Actions), `ComposerBannerStack.tsx` L1-90 (priority: activity < urgent/error/warning < notice;
  collapsed "peek" shows the top banner + count, expands on click, 220 ms dismiss transition, focus management),
  `docs/internals/web-ui.md` "Composition".
- What: all transient composer-adjacent status (usage limit hit, provider update available, server update,
  plan follow-up, worktree setup, queued messages, goal progress) use ONE stack component so they never pile up.
- Why: God Eye has `FocusBanner`, `BriefingCard`, `SyncChip` etc. placed ad hoc.
- Adopt: a `ComposerBanner` slot component in God Eye `components/`. Effort: S.
- License: MIT.

**U12. Context window meter, compaction, resume-after-cache-expiry prompt**
- Where: `components/chat/ContextWindowMeter.tsx` (179) + `.logic.ts` (L12-100), `docs/user/portable-handoffs.md`
  (limits), `server provider/ClaudeTurnTokenUsage.ts`.
- What: a ring in the composer shows used/total tokens, "compacts automatically at N tokens", and a Compact
  button when the provider exposes `/compact`. Special case: for Claude, when the thread idled longer than the
  prompt-cache TTL (1 h + slack, `CLAUDE_RESUME_COMPACTION_FALLBACK_MS` = 70 min) and has >= 100k tokens, it
  asks "Compact before continuing? Resuming now re-reads the whole context uncached" (a synthetic
  user-input question; "never ask again" answer stored).
- Why: this is cost control, which is a core God Eye theme (Limits page, `costs.ts`). God Eye can compute the
  same from the Claude transcript `usage` blocks it already reads.
- Adopt: `pages/Chat.tsx` header + `apps/server/src/adapters/claude.ts` (expose last usage + timestamp).
  Effort: S-M.
- License: MIT.

**U13. Virtualized timeline with anchoring, minimap and in-thread find**
- Where: `components/chat/MessagesTimeline.tsx` L1428 (`LegendList` from `@legendapp/list`, `keyExtractor`,
  `getItemType`, `maintainScrollAtEnd`), `timelineScrollAnchoring.ts`, `chatCanvasLayout.ts`, `lib/observeResize.ts`
  (single shared ResizeObserver; lint rule `no-raw-resize-observer`), `timelineMinimapItems.ts` (a rail of user
  prompts, each with the final assistant answer as hover preview), `ThreadFindBar.tsx` + server `ThreadFind.ts`
  / `ThreadSearch.ts` (find across messages AND older history not loaded; `mod+f`), `docs/user/keybindings.md`.
- Why: God Eye `Chat.tsx` has no list virtualization (no virtual lib in `apps/web/package.json`). A 2-hour
  Claude session is thousands of rows.
- Adopt: evaluate `@legendapp/list` (MIT) or `@tanstack/react-virtual`; copy the minimap idea (cheap, very
  useful) and the "bounded recent window + page older history" model from P3. Effort: L (virtualization with
  variable-height streaming rows is the hard part; T3 spent thousands of lines on it).
- License: MIT (verify `@legendapp/list` license separately).

**U14. Diff viewer: worker pool, annotations become composer chips, find in diff**
- Where: `components/DiffWorkerPoolProvider.tsx` L1-60 (shared pool of 2-6 workers = cores/2, idle TTL 30 s,
  AST LRU 240, `tokenizeMaxLineLength` 1000), `lib/diffRendering.ts` (patch cache key via double FNV-1a, "raw"
  fallback when a patch cannot be parsed), `components/diffs/AnnotatableCodeView.tsx` +
  `DiffCommentAnnotation.tsx` (click a line, write a review comment; it becomes a `review_comment` context chip
  in the composer), `@pierre/diffs` library, `docs/user/keybindings.md` "Find in a diff" (`mod+f` searches folded
  files and hidden unchanged lines), per-turn diff = `CheckpointStore.diffCheckpoints` and the "authored paths"
  filter (A5).
- Why: God Eye `DiffView.tsx` is 29 lines. Review-comment-to-agent is a direct feature for a harness that watches
  code changes.
- Adopt: M: add line comments in `DiffView.tsx` that insert a quoted block into the chat input. L: worker
  highlighting. Check `@pierre/diffs` license before depending on it (not audited).
- License: MIT for T3's code; `@pierre/diffs` unaudited.

**U15. Visual replies (agent-generated HTML pages) and MCP Apps**
- Where: server `apps/server/src/htmlRender/HtmlRender.ts`, MCP tools `mcp/toolkits/html/tools.ts`
  (`html_preview` then `html_render`), `packages/shared/src/htmlRender.ts` L205-315 (theme -> CSS variables:
  `--background --foreground --muted --card --border --primary --accent --destructive --warning --success --info
  --code-background --chart-1..6 --radius --font-sans --font-mono`, plus a THEME_GUIDE and LAYOUT_GUIDE string
  that is pasted into the tool description), web `components/chat/HtmlRenderFrame.tsx` (sandboxed iframe, width
  measured by ResizeObserver, height from a headless-Chrome measurement at 9 widths (320..1144) with
  `postMessage` `ui/notifications/size-changed`, fullscreen dialog, click on image opens viewer, forwards app
  shortcuts into the frame), `McpAppFrame.tsx` (497 lines; MCP Apps standard `ui/*` messages, ask-before-tool-call
  unless read-only), `docs/user/html-renders.md`, instruction text `packages/provider-core/src/server/
  orchestrationInstructions.ts` "Showing visuals".
- What: this is how T3 does "rich UI (charts, tables, generative UI)": no chart components at all. The agent
  writes self-contained HTML, the app injects the active theme as CSS variables so it follows light/dark live,
  measures it, stores it as a thread attachment (images inlined as data at publish time so it survives file
  moves), and shows it above the reply. 10 MiB per image, 25 MiB per page limits.
- Why: God Eye has `RichBlocks.tsx`/`RichPreviews.tsx` (fenced blocks rendered as charts) and `Mermaid`, but
  only for formats the app anticipates. This is open-ended and fits personas ("expert agents") that should
  produce dashboards or comparison tables, and God Eye's own `Design.tsx`.
- Adopt: M. (1) Expose an MCP tool `render_html` from God Eye's MCP bridge (`apps/server/src/mcp.ts`) that stores
  the HTML in the session and (2) render it in a sandboxed `<iframe sandbox="allow-scripts">` with `srcdoc`,
  injecting the God Eye CSS variables (`apps/web/src/styles.css` tokens). Skip headless-Chrome measurement; use
  a `ResizeObserver` message from a tiny injected script (T3's own bootstrap does exactly that, plus
  `HTML_RENDER_LAYOUT_GUIDE` rules like "no 100vh"). Effort M; MCP Apps full support: L.
- License: MIT.

**U16. Keybindings: configurable, `when` expressions, command ids, per-context**
- Where: `docs/user/keybindings.md`, `packages/shared/src/keybindings.ts`, `apps/server/src/keybindings.ts`,
  `apps/web/src/keybindings.ts`, settings UI `components/settings/KeybindingsSettings.tsx`.
- What: `~/.t3/userdata/keybindings.json` is an array of `{key, command, when}`; `mod` = Cmd/Ctrl;
  `when` uses `terminalFocus && !composerFocus`, `turnRunning`, `isDesktop`, `editableFocus`...; last matching
  rule wins; new defaults are merged in on upgrade without overwriting customisations; most defaults carry
  `!terminalFocus`. Composer shortcuts worth copying: `mod+shift+m` model picker, `mod+shift+e` effort,
  `mod+shift+a` access mode, `mod+shift+x` workspace, `mod+shift+g` branch, `mod+1..9` jump to thread,
  `mod+[` / `mod+]` back/forward, `mod+shift+t` reopen closed tab, `mod+u` usage page, `mod+z` undo sidebar
  action, `mod+k` palette.
- Why: God Eye has `CommandPalette.tsx` but keybinding code exists only in the code editor (grep). A power-user
  tool needs this.
- Adopt: `apps/web/src/lib/keybindings.ts` with a tiny `when` evaluator (~80 lines) and JSON in settings.
  Effort: M.
- License: MIT.

**U17. Command palette**
- Where: `components/CommandPalette.tsx`, `CommandPalette.logic.ts`, `CommandPaletteResults.tsx`;
  `docs/internals/performance-regressions.md` "Background work and navigation": result rows lease live VCS/PR
  queries only while visible (+ small overscan).
- What: `Cmd/Ctrl+K`; search threads across environments with message-text search (>= 2 chars); `>` prefix =
  actions only; "Change theme", "Change appearance", "Restart agent session", "Copy prompt link".
- Why: God Eye has one; the lease-while-visible trick and `>` actions mode are cheap upgrades.
- Adopt: `CommandPalette.tsx`. Effort: S.
- License: MIT.

**U18. Themes, fonts, density, motion**
- Where: `docs/user/appearance.md`, `components/settings/ThemeEditorPanel.tsx`, `ThemeImportDialog.tsx`,
  `vscodeThemeImport.ts`, `openVsxThemes.ts`, `themePalette.ts`, `appearanceContrast.ts`, `appearanceFonts.ts`,
  `packages/shared/src/themePalettes.ts`, server `environmentTheme.ts` (`t3 theme set <name>` publishes a theme
  from `~/.t3/userdata/themes/*.json` to all clients).
- What: separate theme for light and dark; import VS Code themes (and search Open VSX); generated palette from just
  `canvas` + `accent` hex; contrast checker; "panel animations" slider 0-400 ms default 0 (respects
  reduced-motion); font family picker; color picker that lets you click an area of the app to find the token.
- Why: God Eye 7.0 "calm interface" theme; user-editable themes mapped to CSS variables are mentioned in the
  crush notes too. The 2-colour generated palette is the cheapest good version.
- Adopt: `apps/web/src/styles.css` tokens + a `Settings` appearance section. Effort: M.
- License: MIT.

**U19. First-run wizard and project import from existing CLI history**
- Where: `docs/user/welcome-wizard.md`, `components/onboarding/WelcomeWizard.tsx`, `FirstRunGate.tsx`;
  server `claudeHistoryWorker.ts`, `project/*`.
- What: step 1 connect computers, step 2 "Check your agents" (detects Claude Code/Codex installed + signed in,
  and if not, opens a terminal with the exact install/login command ready to run), step 3 "Import your projects":
  scans directories the CLIs have used, groups clones by git remote (`owner/name`), preselects repos active in
  the last 30 days with >= 3 conversations, skips worktrees/Downloads/scratch dirs, and imports the last 30 days
  of conversations (first prompt + newest 200 visible messages, no tool output; files > 16 MiB skipped).
- Why: God Eye `Onboarding.tsx` + `imports.ts` do import; compare the selection heuristics and the "open a terminal
  with the fix command prefilled" pattern for missing CLIs.
- Adopt: `pages/Onboarding.tsx`. Effort: S.
- License: MIT.

**U20. Prompt links, undo notices, draft hero**
- Where: `docs/user/prompt-links.md` (`/new?prompt=...&repo=owner/name&provider=...&model=...&pr=owner/name/123`;
  a link never runs anything, only opens a draft), `components/chat/DraftHeroHeadline.tsx`,
  `NoActiveThreadState.tsx`, `NoProjectsHero.tsx`, `components/ui/empty.tsx`.
- Why: shareable prompts for teams (God Eye team sync, library of prompts `PromptPicker.tsx`) with a safe contract.
- Adopt: S, add `?prompt=` handling to the new-session route. License: MIT.

**U21. Secret request card**
- Where: `components/chat/SecretRequestCard.tsx`, `packages/client-runtime/src/secret-request.ts`, MCP tool
  `request_secret`, instruction text in `orchestrationInstructions.ts`.
- What: when an agent needs a token it calls `request_secret`; the UI shows a masked input with a privacy note;
  the value goes to the server secret store; the agent receives only a `secretRef`, which tools like
  `schedule_task` (`signature.secretRef`) consume once. The secret never appears in the transcript.
- Why: God Eye has `vault.ts` and `SecretGuard.tsx`; this is the missing agent-facing flow.
- Adopt: M. License: MIT.

**U22. Terminal drawer**
- Where: `components/ThreadTerminalDrawer.tsx`, `apps/web/src/terminal/ghostty/core.ts`,
  `docs/internals/terminal-runtime.md`, `docs/user/terminal.md`.
- What: server owns PTYs, 5,000 lines / 8 MiB scrollback per terminal, restore reads only the bounded tail and
  skips an incomplete UTF-8 prefix; retained history has terminal query/response traffic stripped and the web
  renderer detaches its PTY writer during replay (otherwise old device-status queries make the shell print junk);
  terminals idle at a prompt close on "settle"; terminal text selections become composer chips.
- Why: God Eye embeds terminals (`Terminals.tsx`, `terminals.ts`); the replay-junk and bounded-tail rules are
  real bugs waiting to happen. Does God Eye use xterm.js? T3 uses its own libghostty-vt WASM; not worth copying.
- Adopt: S, the two protections in `apps/server/src/terminals.ts`. License: MIT.

**U23. Usage page**
- Where: `docs/user/usage.md`, `components/usage/UsagePage.tsx`, `UsageProviderChart.tsx`, `UsageShareBar.tsx`,
  `UsagePriceOverrides.tsx`; server `usage/*` (see A8).
- What: tokens, cache savings, cost split by token type and speed tier ("Fast" premium), per model breakdown with
  cache hit rate and cost per million, per-environment filter, price override table with "Map to" aliasing.
- Why: direct overlap with God Eye Limits page + `costs.ts`. Adopt in `pages/Limits.tsx`: cache hit rate and
  "premium" columns, price override and model alias map. Effort: S-M. License: MIT.

### B. Architecture

**A1. Event-sourced orchestrator with outbox (the core design)**
- Where: `docs/internals/overview.md` "Durable intent and side effects"; `apps/server/src/orchestration-v2/
  Orchestrator.ts`, `EventSink.ts` (936 lines: `write`, `writeWithEffects`, `writeIfRunCurrent`,
  `writeIfProviderThreadOwner`: compare-and-set commits), `EffectOutbox.ts` L25-100 (effect union:
  `provider-turn.start/steer/interrupt/restart`, `runtime-request.respond`, `provider-thread.rollback`,
  `checkpoint.capture`, `terminal.cleanup`, `preview.cleanup`, ...), `EffectWorker.ts`, `CommandReceiptStore.ts`.
- What: commands are decided purely; events + projections + command receipt + outbox rows commit in ONE SQLite
  transaction; the worker runs side effects after commit and feeds results back as commands. A command ack means
  "intent committed", not "agent finished". Duplicate command ids return the stored receipt (idempotent retry).
  Snapshots carry `snapshotSequence`; clients apply only events with greater sequence. Events must stay decodable
  forever (replay at startup), so schemas are append-only with fallbacks.
- Why for God Eye: God Eye observes external CLIs rather than owning the loop, so a full port is not needed. The
  transferable parts: (a) command receipts for idempotent HTTP POSTs from flaky clients (mobile, team sync),
  (b) the outbox for "run X after commit" (summaries, hallucination checks, hooks fan-out) so a crash between
  write and side effect does not lose work, (c) snapshot+sequence cursor for the WebSocket in `bus.ts`, so a
  reconnecting browser gets only missed events instead of a refetch.
- Adopt: `apps/server/src/bus.ts` (48 lines) is the natural place: add a monotonically increasing sequence per
  session to events and `?after=N` on the stream route. Effort: M (b: M, a: S).
- License: MIT (pattern).

**A2. Provider adapter contract + capability flags instead of provider-name conditionals**
- Where: `packages/provider-core/src/server/ProviderAdapter.ts` L79-170 (event union), L535-640 (runtime
  interface), `docs/orchestration-v2/provider-capability-system.md` (flags for sessions/threads/turns/streaming/
  tools/approvals/planning/subagents/context/checkpointing/identity), `CommandPolicy.ts` L20-60
  (`MessageDispatchDecisionV2`: start_run | steer_active | restart_active | queue_after_active | switch_provider),
  `contracts/src/orchestrationV2.ts` L193-330.
- What: every feature asks "does this adapter's capability allow it?" (e.g. `terminalStatusQuality: strong|weak|none`
  tells the orchestrator whether to trust a native "turn completed" event; `approvalCallbacksAreLiveOnly` marks
  approvals `not_resumable` after a restart). Missing capability is a first-class value; the UI hides or disables
  instead of failing. Also: provider events are never rewritten to look like another provider's; app-owned ids
  are primary and provider ids are refs.
- Why: God Eye's `apps/server/src/adapters/{claude,codex,gemini}.ts` all normalise into `types.ts`; a typed
  capabilities object on that interface (can resume? can steer? can fork? streams thinking? reports tokens?
  has plan mode?) will keep UI conditionals out of the pages and make adding a 4th tool (OpenCode, Pi, Cursor)
  predictable. This is the single most reusable architectural idea.
- Adopt: `apps/server/src/adapters/types.ts` add `Capabilities`, expose via `/api/adapters`; web uses it for
  disabling Steer/Fork/Rollback buttons. Effort: S-M.
- License: MIT.

**A3. How T3 drives Claude Code: Agent SDK `query()` with `canUseTool`**
- Where: `ClaudeAdapterV2.ts`: options builder L1060-1160 (`resume` vs `sessionId`, `includePartialMessages: true`,
  `permissionMode`, `systemPrompt: {type:"preset", preset:"claude_code", append: ...}`, `additionalDirectories`,
  `mcpServers`, `thinking: {type:"adaptive", display:"summarized"}`, `settings`), runtime-policy -> Claude
  `PermissionMode` mapping L1754-1800 (`approval-required -> default`, `auto-accept-edits -> acceptEdits`,
  `auto -> auto`, `full-access -> bypassPermissions`, plan interaction -> `plan`, read-only sandbox -> `dontAsk`
  with a read-only tool list), `canUseTool` L7707-7930, live query reuse keyed by the effective policy L1870-1900.
- What: approvals and AskUserQuestion are handled INSIDE `canUseTool`: it creates a runtime request + execution
  node + turn item, parks on a `Deferred`, and resolves it when the UI answers (or returns `deny` on abort
  signal). `AskUserQuestion` returns `allow` with `updatedInput.answers` filled in (that is how a CLI question
  gets an answer). `ExitPlanMode` is intercepted: the plan markdown is captured as a `proposed_plan` item and the
  tool is DENIED with "The client captured your proposed plan. Stop here and wait for the user's feedback"
  (L7831-7848), so the CLI never leaves plan mode on its own. `permissionMode` is switched live with
  `setPermissionMode` and restored (L8089-8093).
- Why: God Eye drives Claude Code (see `apps/server/src/adapters/claude.ts`, `guards.ts`, `hooks.ts`). It
  currently relies on hooks/ask rules. The SDK route gives real structured approvals, plan capture and question
  answering without terminal scraping. I did not inspect how God Eye spawns Claude today beyond filenames, so
  the gap size is a guess: check whether it uses `claude -p --output-format stream-json` or the SDK.
- Adopt: M-L. For the plan-capture and AskUserQuestion answer flows, the equivalent in CLI mode is a
  `--permission-prompt-tool` MCP tool or PreToolUse hook returning deny with that message; S-M to prototype
  in `hooks.ts`.
- License: MIT (pattern; the code is Effect-coupled).

**A4. Codex via `codex app-server` JSON-RPC (generated typed client)**
- Where: `packages/effect-codex-app-server/src/{client.ts, protocol.ts, rpc.ts, replay.ts, _generated}` (62k lines
  generated from the app-server schema), `apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts` (7.3k),
  `docs/internals/providers.md` "Protocol traps".
- What and traps worth knowing: `thread/status/changed` goes idle BEFORE `turn/completed`, so only the latter is
  terminal; `turn/interrupt` returns first and the interrupted state arrives later; approvals are provider-
  initiated requests scoped to thread+turn+item; async questions arrive as notifications and are answered with a
  NEW user message (no pending RPC); `/goal` can run several native turns inside one app run; resume with
  metadata-only reads; opt out of `turn/diff/updated` and derive diffs from checkpoints.
- Why: God Eye's `adapters/codex.ts` reads Codex sessions; if it ever drives Codex, this is the map of protocol
  hazards. Adopt: reference only. Effort: n/a now.
- License: MIT (generated schema is derived from OpenAI's app-server types; check upstream license before
  copying generated files).

**A5. Checkpoints: details beyond what God Eye already has**
- Where: `apps/server/src/vcs/GitVcsDriver.ts` capture L794-1040, restore L1040-1115, `checkpointing/CheckpointStore.ts`
  (interface L1-60: capture, hasRef, restore, diff, `listAuthoredPaths`, deleteRefs),
  `orchestration-v2/CheckpointRestoreSafety.ts` L1-60, `CheckpointRollbackService.ts`.
- What God Eye already does (confirmed in `apps/server/src/checkpoints.ts`): hidden ref, throwaway `GIT_INDEX_FILE`
  seeded from the real index, `add -A`, `write-tree`. Extra T3 details worth adding:
  1. `commit-tree ... -p HEAD` so HEAD is the parent; `listAuthoredPaths` compares two checkpoints to see if HEAD
     moved and hides files a pull/merge/rebase brought in, so "what did the agent change this turn" stays honest
     (docs/user/source-control.md "Review turn changes").
  2. `core.fsync=objects,reference` on checkpoint writes: an unclean restart otherwise leaves 0-byte files under
     the ref namespace that break later fetch/push (comment L~930).
  3. Recovery path when `git add -A` fails on an embedded repo with no commits: list untracked dirs ending in `/`
     that contain `.git` without HEAD and retry with `:(exclude,literal)dir/`.
  4. Sparse-checkout handling (`--sparse`, cone-only rebuild, otherwise refuse instead of publishing false deletions).
  5. Restore = `git restore --source <commit> --worktree --staged -- .` + `git clean -fd` + recreate the workspace dir.
  6. RESTORE SAFETY: files are restored only if the thread runs in an isolated worktree that no other thread/agent
     path contains or is contained by (`CheckpointRestoreSafety.ts`); otherwise only the conversation rewinds.
  7. Rollback is coordinated with the provider conversation: a provider that cannot roll back its conversation
     rejects BEFORE the filesystem is touched (overview.md "Turn completion and checkpoints").
- Why: items 1, 2, 6, 7 are cheap and prevent real data-loss/corruption bugs.
- Adopt: `apps/server/src/checkpoints.ts` + `worktrees.ts`. Effort: S each.
- License: MIT.

**A6. Subagents and "orchestrator MCP": agents delegate to other agents through an app-owned MCP server**
- Where: `docs/orchestration-v2/orchestrator-mcp-server.md` (555 lines), `apps/server/src/mcp/*`,
  `mcp/toolkits/orchestrator/*`, `McpSessionRegistry.ts` (credential scoped to environment + parent thread +
  provider instance + provider session, idle/max-lifetime expiry, revoked on session release),
  `McpToolAccess.ts` (every tool must declare who may call it or the TS build fails; read-only tools are an
  explicit allowlist cross-checked in a test: `CLAUDE_READ_ONLY_T3_MCP_ALLOWED_TOOLS`, `ClaudeAdapterV2.ts` L1190).
- What: eleven tools: `orchestrator_capabilities`, `delegate_task` (creates a child THREAD on any configured
  provider/model, async or wait, role: implementation/research/review/design/test/general, inherits runtime/
  interaction mode and can only step down permissions), `task_status`, cancel, `t3_thread_launch` (new thread
  with an explicit workspace strategy root | worktree | existing_worktree), thread list/read/wait/send/steer/
  interrupt, `schedule_task`, `request_secret`, `html_render`, preview and device tools. The child receives only
  its task prompt, never the parent history. Injected into Claude (`mcpServers` http + bearer), Codex (`-c
  mcp_servers.t3-code.url=...`), Cursor/Grok/ACP (session/new `mcpServers`), Pi (extension bridge).
  The orchestration guidance is appended to the system prompt (`orchestrationInstructions.ts`).
- Why: God Eye has personas, flows and Arena (`personas.ts`, `flows.ts`, `arena.ts`) but they are driven by
  God Eye, not callable BY an agent mid-session. Exposing "ask the security persona", "start a review run in a
  worktree", "request secret", "render html", "get project memory" as MCP tools means every Claude/Codex session
  that God Eye supervises can use God Eye's features. God Eye already has `mcp.ts`/`mcpservers.ts`.
- Adopt: M. Extend `apps/server/src/mcp.ts` with a scoped-token HTTP MCP endpoint and inject it in the adapter
  launch (Claude `--mcp-config`). Start with 4 tools: `godeye_memory_search`, `godeye_persona_ask`,
  `godeye_request_secret`, `godeye_render_html`. Copy the token-scoping and tool-declares-its-audience rules.
- License: MIT.

**A7. Context handoff and provider switching mid-thread; forks and merge-back**
- Where: `docs/orchestration-v2/provider-switching-and-context.md`, `thread-lineage-and-context-transfer.md`,
  `docs/user/portable-handoffs.md`, `ContextHandoffService.ts` (498), `ContextHandoffBudget`, `ThreadForkService.ts`,
  `ProviderSwitchService.ts`, commands `thread.fork`, `thread.merge_back`, `provider.switch`.
- What: a thread outlives its provider. Switching Claude -> Codex creates a `ContextHandoff` artifact (a BUDGETED
  SELECTION of messages, not an LLM summary): the original request + most recent turns + command outcomes, user's
  new request never shortened, omitted history referenced so the agent can fetch it with a thread-read tool.
  Token cap default 16,000 (env `T3CODE_CONTEXT_HANDOFF_TOKEN_CAP`, clamp 1,024-64,000), fallback window 128k with
  reserve = max(16k, window/4), images count 8,192 each. Forks record lineage first and resolve lazily
  (native fork if the provider supports it, portable context otherwise). Fork from any assistant message
  ("Fork from here"). Subagent threads are the same primitive.
- Why: matches God Eye plan 2.8 "Session devri" (handoff) and the Arena. The budgeted-selection rule (no LLM
  call, deterministic, user's request untouched) is a good default and cheaper than summarising.
- Adopt: M. `apps/server/src/summarizer.ts` or a new `handoff.ts`; UI "Continue in Codex" on a Claude session.
  License: MIT.

**A8. Usage and cost from the CLIs' own transcripts, incrementally, with pricing from LiteLLM**
- Where: `apps/server/src/usage/usageTranscriptReader.ts` L1-60 (+ rest), `usageScanCache.ts` (363),
  `usageAggregation.ts`, `usagePricing.ts` (305; LiteLLM price table, cache read/write rates, "fast"/"ultrafast"
  tiers, user overrides and model aliasing), `provider/claudeUsageLimits.ts` L1-60 (Claude SDK control request
  `get_usage` -> 5-hour "Session" and 7-day "Weekly" windows plus per-model scoped windows, streamed
  `rate_limit_event` updates the same rows mid-turn), `codexUsageLimits.ts`, `cliproxyApi.ts`.
- What: streams transcript files as raw buffers (comment: cold 30-day window is ~1.4 GB over ~1,500 files, buffer
  streaming ~10x cheaper than materialising); picks only needed JSON fields; resumable scans store
  `resumeOffset` + a 64-byte guard hash (FNV-1a) of the bytes before the offset and fall back to a full parse if
  the file was rotated/rewritten; trailing segment without newline is excluded and re-read next scan.
- Why: this is the same data God Eye's adapters read. `apps/server/src/costs.ts`/`limits.ts`/`indexer.ts` can adopt
  the append-only resume with a guard hash (cheap and robust), the LiteLLM price JSON
  (https://github.com/BerriAI/litellm model_prices_and_context_window.json; MIT) instead of hand-kept rates,
  and the SDK `get_usage` probe for real plan-limit percentages instead of estimating.
- Adopt: S for guard-hash resume; S for LiteLLM prices (download at update time, cache); M for `get_usage`.
- License: MIT (T3 code); LiteLLM data MIT.

**A9. Live streaming protocol and back-pressure (what goes over the wire)**
- Where: `packages/contracts/src/orchestrationV2.ts` `OrchestrationV2ThreadStreamItem` L3283-3305 (`synchronized`
  | `snapshot` {snapshotSequence, projection, historyCursor, hasMoreHistory, payloadBudgetExceeded} | `event`
  {sequence, event} | unknown fallback), shell stream L1881-1913 (`project.updated`, `thread.updated` with
  `location: active|archive`, `thread.removed`), `ThreadLiveEventCoalescer.ts` L18-19 (50 ms window, 512 pending
  cap, collapses repeated running updates of the same tool item), `LiveStreamBudget.ts` L22-23 (1,000 items / 8 MiB
  per subscriber; exceeding it FAILS the subscription so the client resnapshots rather than the server buffering
  forever), `ProviderTextDeltaCoalescer.ts` (156), `CommandOutputHub.ts` L28-50 (see P4), `WireProjection.ts`.
- What: assistant text deltas and tool progress are coalesced server-side; bulky bodies (raw command output,
  dynamic tool results, inline file-change bodies) are omitted at the wire boundary and fetched on demand
  (`orchestration.getTurnItem`); cold open of a thread = latest 75 timeline rows within ~1 MiB, older history by
  bounded HTTP pages (`threadHistoryPaging.ts`, `ThreadHistoryPage`); resume replays at most 128 events / 1 MiB
  before falling back to a snapshot.
- Why: God Eye `bus.ts` + SSE/WS to the browser will otherwise send every event of a 5,000-event session. The
  budgets are the specific numbers, with a regression-test command (`vp run test:perf:v2-wire`).
- Adopt: M. Coalesce deltas at 50 ms in the server stream, omit tool output bodies from the list payload, page
  history. License: MIT.

**A10. Client connection runtime (reconnect, freshness, caches)**
- Where: `docs/internals/connection-runtime.md`; `packages/client-runtime/src/connection/{supervisor,registry}.ts`,
  `rpc/session.ts`, `state/threads.ts`.
- What and rules: ONE retry owner per environment with jittered exponential backoff capped at 5 min that only
  resets after the connection stays up; offline reports are often wrong (loopback), so foregrounding probes the
  session instead of reconnecting; "transport health" and "data freshness" are separate states ("reconnecting"
  is a lie when only a subscription failed); cached projections readable offline but never overwrite newer live
  data; thread detail subscription is shared by mounted consumers and cached 5 idle minutes with its cursor so
  back-navigation resumes; do NOT advance a cached cursor beyond applied data on cancellation; mutations are
  never auto-replayed on reconnect.
- Why: God Eye has a web UI over a local server + team sync + (future) mobile; these rules prevent
  "spinner lies" and duplicate sends. God Eye `SyncChip.tsx` and `apps/server/src/sync/*` are the spots.
- Adopt: S-M: backoff with jitter, separate "connected" vs "synced" in the chip, resume with `?after=seq`.
- License: MIT.

**A11. Auth model for remote access: scopes, pairing, DPoP, tickets, relay as untrusted broker**
- Where: `docs/internals/environment-auth.md`, `apps/server/src/auth/{http.ts, RpcAuthorization.ts, McpOAuth.ts}`,
  `docs/internals/t3-connect.md`, `docs/user/remote-access.md` (361), `infra/relay`.
- What: every RPC declares a required scope (`filesystem:read`, `terminal:operate`, `orchestration:operate`,
  `access:write`...) checked by middleware before any handler; pairing links delegate a scope set and can only be
  narrowed on exchange; the read model never contains recoverable secrets; WS upgrade uses short-lived tickets so
  long-lived tokens stay out of URLs; DPoP binds tokens to a client key; agents that T3 did not launch sign in to
  `/mcp` via a narrow OAuth code flow (loopback or HTTPS redirect, PKCE, read-only default, or a runtime-mode
  ceiling), and that subject is rejected on every other path; asset URLs are signed bearer URLs bound to a file's
  device/inode; `t3 auth pairing create`, `t3 serve --host`, `t3 pair --tailscale`.
- Why: God Eye is "local web app" with team sync (plan Phase 4) and server access; the scope-per-method table and
  "pairing can't widen" are directly reusable when the Hono API is exposed beyond localhost. God Eye
  `team-routes.ts` / `security.ts` / `sync/`.
- Adopt: M. License: MIT.

**A12. Remote / headless / background service**
- Where: `docs/user/background-service.md` (126), `docs/user/remote-access.md`, `apps/server/src/serviceLauncher.ts`,
  `cloud/`, `docs/internals/server-updates.md`, `t3 service install`, `t3 update`, `npx t3@latest`,
  `curl -fsSL https://t3.codes/install.sh | sh`.
- What: the server installs itself as a background service (systemd/launchd/Windows), self-updates, hands off to
  a replacement process on update while retaining tunnels, runs the same server inside desktop; clients (web at a
  hosted URL, mobile) connect to any server; webhooks are held by the relay while the machine is offline and
  delivered with an idempotency header (`x-t3-relay-delivery-id`).
- Why: God Eye is Docker/Bun local; `t3 service install` style one-command background install and
  `update` is what "teyze test" users need.
- Adopt: S-M: `godeye service install` that writes a systemd user unit / launchd plist. License: MIT.

**A13. Scheduled tasks**
- Where: `packages/contracts/src/scheduledTask.ts`, `apps/server/src/scheduledTasks/ScheduledTaskService.ts` (1601),
  `Schedule.ts`, `webhookTemplate.ts` (`{{body.path}}`, `{{headers.name}}`, `{{query.name}}`, `{{body}}`,
  `{{request}}` placeholders in the prompt), `webhookVerification.ts` (HMAC-SHA256 with configurable header,
  encoding and prefix such as `sha256=`), `RelayDeliveryProof.ts`, MCP tools `schedule_task` /
  `list_scheduled_tasks`, UI `settings.scheduled-tasks.tsx`.
- What: three schedule types: interval (min 60 s), fixed_time (HH:MM local + weekdays), webhook (URL token +
  optional signature + max delivery age). A task = prompt + project + model + runtime mode + workspace
  strategy. Agents can create tasks themselves. Wake-from-sleep handled by `HostPowerMonitor`.
- Why: God Eye Phase 9 scheduled jobs (`schedules.ts`, `jobs.ts`): the webhook trigger with templated prompt and
  HMAC check is the missing piece (GitHub/Sentry/Stripe events starting an agent). `bridges.ts` already has
  webhooks; unify.
- Adopt: S-M. License: MIT.

**A14. Limit/rate-limit recovery**
- Where: `docs/user/thread-sidebar.md` "Inspect agent work", contracts `OrchestrationV2LimitRecovery`
  (L332-354), shell `usageLimitResetAt`, `limitRecovery`, `UsageLimitRecoveryBanner.tsx`, setting
  "Auto-resume limited threads", `loadBalancing`.
- What: a thread that stops on a provider usage limit is marked "Limited" with the provider's reset time; one
  click schedules "Resume at reset" (server resumes overdue continuations after restart), "Snooze until reset"
  hides it and wakes it; queued messages stay saved. Also multi-account: several accounts per driver, and
  `packages/client-runtime/src/load-balancing.ts` (whole file, 40 lines) picks the machine for a new thread by
  `weight * cpuCount * (1 - cpuUtil) * memAvailable%`, skipping hosts with stale (>15 s) samples, CPU >= 95 % or
  memory <= 5 %.
- Why: God Eye Phase 3 accounts + limits page. "Resume at reset" is a concrete, high-value automation for people
  who burn 5-hour windows. Adopt: `limits.ts`, `schedules.ts`, `Inbox.tsx`. Effort: M. License: MIT.

**A15. Thread/session persistence and migration**
- Where: `docs/internals/legacy-orchestration-migration.md`, `docs/user/thread-migration.md`,
  `apps/server/src/orchestration-v2/legacy/`, `persistence/` (migrations), `scripts` `migrate-dev-db`
  (`apps/server/scripts/migrate-dev-db.ts`: rebuilds a dev database from a READ-ONLY snapshot of the real one,
  keeping recent projects and stopped threads and dropping schedules, pending work and auth sessions so a dev
  server cannot run the developer's agents), AGENTS.md "Test data".
- Why: `migrate-dev-db` is a good pattern for God Eye's own dev loop ("demo data from my real DB, minus
  dangerous rows"). Adopt: S, `apps/server/src/demo.ts` exists; add a "copy sanitised real data" script.
  License: MIT.

**A16. Settlement, startup recovery and "process is gone" handling**
- Where: `ProviderRuntimeRecoveryService.ts`, `docs/internals/performance-regressions.md` "Event store and
  startup", `RestartContinuation.ts`, `RestartBackgroundNote.ts`, `ThreadSettlementService.ts`.
- What: on boot, recovery candidates are chosen from current projection state (queued runs, pending requests, live
  sessions, background work), not by loading every thread; effects tied to a lost provider process are retired
  rather than replayed; approvals become `not_resumable`; a restarted run gets an explicit note about background
  work that was cancelled.
- Why: matches loop/crash handling in the other notes (crush "settle-turn invariant"). For God Eye: on startup,
  mark sessions whose process vanished as "interrupted", never leave spinners. Adopt: S in `chats.ts`.
  License: MIT.

**A17. Collaborative browser + device panels exposed to agents**
- Where: `apps/server/src/preview/*` (Manager, PreviewBrowserHost, ServerBrowser*, PortScanner), MCP
  `preview_*` tools (status, open, navigate, snapshot, click, type, hover, select, drag, upload, press, scroll,
  evaluate, wait_for, dialog, resize, set_appearance, recording_start/stop), `web/components/preview/*`
  (BrowserMockup, AgentBrowserCursor shows the agent's cursor, PreviewLocalServerCard auto-discovers local dev
  servers via PortScanner, mini-player), `docs/user/devices.md` (iOS Simulator / Android Emulator streamed in a
  panel with `device_*` tools and `agent-device` CLI), `T3_CODE_BROWSER_TOOL_INSTRUCTIONS`
  (`orchestrationInstructions.ts`: "prefer preview_* tools, call preview_status first, do not switch to
  standalone Playwright unless ...").
- Why: God Eye Phase 10 "Canlı Önizleme ve Seç-Değiştir" (live preview and pick-and-edit) and test users
  (`testers.ts`). T3's picked-element and "preview annotation" chips are exactly pick-and-edit.
  `preview/` in God Eye already exists; compare: shared tab visible to both user and agent, agent cursor
  overlay, annotations as context chips, recording.
- Adopt: M-L. License: MIT.

**A18. Source-control integration beyond git: PRs as first-class**
- Where: `packages/source-control-*`, `apps/server/src/sourceControl`, `pullRequest/`, `PullRequestSyncReactor.ts`,
  `PullRequestWatchReactor.ts`, `docs/user/source-control.md` (307), `components/pullRequest/*`, review guide
  (`contracts/src/pullRequestReviewGuide.ts`: an AI-generated "guided tour" of a PR as ordered stops with
  summary, attention flag (tradeoff/contract/product/risk/accessibility), code excerpts, notes, questions,
  keyed by `headSha`), `client-runtime/src/reviewGuideTour.ts`.
- What: threads link to PRs (multi-link, stacked layers), status pills, auto-settle on merge, create PR from the
  composer, `#123` chips, watch a PR for CI/comment events. Commit/PR/branch text generated by a cheap model with
  a policy (`TextGenerationPresets.ts`: conventional commits | repo conventions | custom).
- Why: God Eye `codehost.ts`, `deploy-routes.ts`, Phase 1.2c git/deploy flow. The review-guide JSON shape is a
  neat spec for God Eye's "explain this PR to a non-expert" feature. Adopt: S for the schema; M for UI.
  License: MIT.

### C. Code quality and performance ideas

**Q1. AGENTS.md as the product spec for the agent that edits the repo**
- Where: `AGENTS.md` (single file, also `CLAUDE.md`, `.cursor`, `.agents/skills/{contribution-triage,test-t3-app,
  test-t3-mobile}`, `.claude/skills/*`).
- Highlights: "The three ways to hurt yourself" (never `pkill -f`, never touch the live DB, never bake origins);
  "Hit every surface" checklist (entry points, clients, providers, agents, contracts, reverse states, connection
  modes, docs); "Taste" section (complexity at the adapter boundary, orchestration pure, UI dumb; UI primitives
  own their look; no continuously repainting animations because they peg GPU; users "notice a dropped frame, a
  lying spinner, and a stale label"); documentation rules (internal docs only for decisions and traps the code
  cannot show; no file catalogs; rewrite instead of append). The glossary is defined for humans and agents.
- Why: God Eye has `plan.md` and per-project docs; a short AGENTS.md at repo root tuned like this is cheap and
  directly improves God Eye's own development by Claude Code. Adopt: S. License: MIT (text), rewrite in own words.

**Q2. Custom lint rules that encode house rules**
- Where: `oxlint-plugin-t3code/rules/*.ts` (each with a test): `no-manual-memo` (React Compiler makes useMemo/
  useCallback redundant), `no-native-title-tooltip`, `no-outset-state-indicators` (focus rings must not render
  outside their box), `require-centered-scroll-gutter`, `no-raw-resize-observer` (use shared `observeResize`),
  `no-test-in-loop`, `no-low-value-comments` (catches comments that restate code), `no-rpc-permission-bypass`,
  `no-raw-mcp-registration`, `no-hermes-unsupported-apis`, `require-suppression-reason`, `no-unscoped-has`,
  `prefer-catch-tags`, `no-global-process-runtime`, `namespace-node-imports`. Plus `shadcn/no-restyle` from
  `@shadcn/lint`.
- Also: `knip` for unused exports/files (`knip:check` in CI), `reactCompilerCoverage.test.ts` compiles every web
  file and fails on any React Compiler bailout, CI "Reject repository-owned PR assets" step.
- Why: God Eye plan Phase 15 (quality gate) wants clean code; these show how to make the rules machine-checked
  instead of aspirational. Adopt: S each; start with a Biome/oxlint rule set and `knip` in God Eye CI; port
  `no-low-value-comments` idea into the Code Cleaner (plan 15.1). License: MIT.

**Q3. React discipline for long-lived big components**
- Where: `docs/internals/web-ui.md` "Handlers in large components" and "React Compiler"; `hooks/useStableCallback.ts`.
- What: V8 shares one closure scope per render, so a memoized handler retains OLD renders (server config, thread
  data) for the component's lifetime; rule: in huge components (ChatView/ChatComposer) write plain functions and
  wrap with `useStableCallback` only where they leave the component; adopt React Compiler and forbid manual memo.
- Why: God Eye `Chat.tsx`/`Session.tsx` will become big; this is a real leak class. Adopt: S (doc + helper).
  License: MIT.

**Q4. Tests: replay-backed integration, drain-don't-sleep, perf budgets in tests**
- Where: `docs/orchestration-v2/testing-strategy.md`, `ProviderReplayTranscript` (contracts L3587-3631: entries
  `expect_outbound` / `emit_inbound` / `runtime_exit` with `afterMs`), `Adapters/*.testkit.ts`,
  `packages/shared/src/DrainableWorker.ts` ("empty queue alone does not prove the worker is idle"),
  `docs/internals/performance-regressions.md` (budgets as tests: 75 rows / 1 MiB cold open, 128 events replay),
  `vp run test:perf:v2-wire`, `*.browser.test.tsx` (Vitest browser mode + Playwright) for components,
  AGENTS.md "Verifying" (never wait on sleeps; drain the worker or await a persisted event).
- Why: God Eye has `*.test.ts` per module (good) but adapter tests should be fed RECORDED real transcripts of
  Claude/Codex/Gemini. Record NDJSON of a real session once, replay through the real adapter+store+projection,
  assert UI-facing state. Adopt: M, `apps/server/src/fixtures` exists; add a recorder flag to adapters.
  License: MIT.

**Q5. Bounded everything (memory and payload budgets)**
- Where: terminal 5,000 lines/8 MiB, client buffer 512 KiB; command output hub 64 live commands / 16 finished /
  100 ms frame / 16 KiB append cap; live stream 1,000 items / 8 MiB; provider log payload 64 KiB with structural
  summaries and bounded traversal BEFORE redaction; trace files serialized async with rotation (sync appends
  stall the event loop on slow disks, "especially on Windows"); highlight LRU 50 MB; diff AST LRU 240; thread
  detail cache 5 idle minutes; message 120k chars; paste 32 KiB; attachment limits.
- Why: God Eye's `logs.ts`, `netlog.ts`, `perf.ts`, `terminals.ts`: audit each unbounded buffer. Adopt: S each.
  License: MIT.

**Q6. Performance rules written down**
- Where: AGENTS.md "Performance without compromise" (sending too much data over websockets, css animations
  causing GPU spikes, lists hard to render), `docs/internals/performance-regressions.md`,
  `apps/web/src/performance.bench.ts`, `lib/visibleAnimation.ts` (`observeVisibleAnimation`: animations run only
  while visible), `panelAnimations.ts` (default 0 ms), `Sidebar.motion.ts`.
- Why: God Eye 7.3 quality goals. Adopt: a "no continuous animation" lint/grep check and visible-only
  animations. S. License: MIT.

**Q7. Contracts-first, forward-compatible wire schemas**
- Where: `packages/contracts` (Effect Schema), `kindUnionWithFallback`, `ForwardCompatibleArray`, unknown stream
  event arm "after the known arm: union members are tried in order", server capability flags in the environment
  descriptor for feature negotiation (overview.md "Pull request linking compatibility" table), `versionSkew.ts`.
- Why: God Eye has `@godeye/core` shared types between server and web; add a `capabilities` object to the
  server hello and make list decoders drop unknown items instead of throwing, so web/server/team-sync versions
  can differ. Adopt: S-M. License: MIT.

**Q8. Dev ergonomics: stable per-worktree ports and state, `t3.json` project scripts**
- Where: AGENTS.md "Dev servers"; `scripts/dev-runner.ts` (ports derived from worktree path, state in the worktree's
  `.t3`, `--share` mints a tailnet pairing URL), `t3.json` (project scripts with `runOnWorktreeCreate`,
  `runOnSettle`, icon), `docs/user/project-settings.md` (207), UI `ProjectScriptsControl.tsx`, keybindings
  `script.{id}.run`.
- What: a per-project file `t3.json` declares named scripts (setup worktree, run tests, dev server) that appear as
  buttons/shortcuts in the thread header; `runOnWorktreeCreate` runs automatically in a new worktree;
  `runOnSettle` cleans (e.g. `cargo clean`) when the thread settles.
- Why: God Eye worktrees (`worktrees.ts`) + flows. A `.godeye.json` with scripts/hooks per project is a small,
  high-value convention. Adopt: S-M. License: MIT.

### D. Features God Eye does not have at all (confirmed by grep in God Eye src, or by listing)

1. Steer / queue messages while the agent runs, promote-to-steer (U10). Effort M.
2. Virtualized chat timeline, prompt minimap, in-thread find across unloaded history (U13). Effort L.
3. Agent-generated visual replies and MCP Apps hosted in chat (U15). Effort M.
4. Orchestrator MCP: agents delegating to other agents / threads / worktrees / scheduling (A6). Effort M-L.
5. Provider switch mid-thread with budgeted context handoff, fork from any message, merge-back (A7). Effort M-L.
6. Rewind conversation ("Edit from here") optionally restoring files, coordinated with provider rollback (A5, U9). Effort M.
7. Settle / snooze / pin / auto-settle sidebar model with Undo (U8). Effort M-L.
8. Limit recovery: "Resume at reset", snooze-until-reset, auto-resume (A14). Effort M.
9. Configurable keybindings with `when` contexts (U16). Effort M.
10. Prompt stash, ArrowUp recall, quote-reply "Cite in composer", inline context chips (U9). Effort S-L.
11. Prompt links `/new?prompt=...&repo=...` (U20). Effort S.
12. Webhook-triggered scheduled agent runs with HMAC check and templated prompts (A13). Effort S-M.
13. `request_secret` private input flow (U21). Effort M.
14. Collaborative browser and device simulators controlled by agent and user (A17). Effort L.
15. SnapShot: global hotkey captures the focused window + its accessibility tree and attaches to the draft
    (`docs/user/snap-shot.md`, `apps/desktop/src/snapShot`, native/ helpers; desktop only). Only relevant if God
    Eye ever ships a desktop wrapper. Effort L.
16. PR review guide (AI-generated guided tour of a PR) (A18). Effort M.
17. Theme editor/import of VS Code themes and server-published themes (U18). Effort M.
18. Load balancing a new thread across several connected machines by CPU/RAM (A14). Effort S (the formula) once multi-host exists (God Eye has `servers.ts`).
19. Detecting an idle conversation beyond the prompt-cache TTL and offering compaction (U12). Effort S.
20. T3 Connect style relay: tunnels, push notifications (APNs/FCM Live Activities) when an agent needs approval,
    mobile app (`apps/mobile`). Large; only the idea of "notify my phone when an approval is pending" is
    cheap via ntfy/Pushover/Web Push. Effort S for web push, L for native.

---------------------------------------------------------------------------------------------------

## 4. Top 15 for God Eye (impact x effort), all MIT

| # | Item | Impact | Effort | God Eye files | Source |
| --- | --- | --- | --- | --- | --- |
| 1 | Capability flags on the adapter interface (A2) | High: future-proofs Claude/Codex/Gemini + new tools | S-M | `apps/server/src/adapters/types.ts`, pages | `docs/orchestration-v2/provider-capability-system.md`, `ProviderAdapter.ts` |
| 2 | Work-log grouping: one-sentence summary of consecutive tool calls (U4) | High: calmer chat | M | `pages/Chat.tsx`, new `lib/workLog.ts` | `work-log/presentation.ts` L631-715 |
| 3 | Incremental markdown + incremental Shiki + LRU (U1, U2) | High: streaming perf | S | `components/Markdown.tsx`, `lib/highlight.ts` | `markdown-incremental.ts`, `incrementalHighlighting.ts`, `lruCache.ts` |
| 4 | Queue / steer while running (U10) | High: daily-use feature | M | `chats.ts`, `chat-routes.ts`, composer | `feature-lifecycles.md` L61-118, `QueuedRunOrder.ts` |
| 5 | Ranked thread status pill + Inbox integration (U7) | High: many parallel agents | S-M | session list, `Inbox.tsx` | `Sidebar.logic.ts` L1080-1160 |
| 6 | Approvals docked in the composer with provider options and not-resumable state (U5, A3) | High | M | `ApprovalCard.tsx`, `Chat.tsx` | `ComposerPendingApprovalActions.tsx` |
| 7 | Orchestrator-style scoped MCP endpoint exposing God Eye features to supervised agents (A6) | High, differentiating | M | `apps/server/src/mcp.ts`, adapter launch | `docs/orchestration-v2/orchestrator-mcp-server.md`, `McpSessionRegistry.ts` |
| 8 | Visual replies: `render_html` tool + themed sandbox iframe (U15) | High: open-ended rich UI | M | `mcp.ts`, `RichPreviews.tsx`, `styles.css` | `shared/htmlRender.ts`, `HtmlRenderFrame.tsx` |
| 9 | Limit recovery: Resume at reset / snooze until reset (A14) | High for subscription users | M | `limits.ts`, `schedules.ts`, `Inbox.tsx` | thread-sidebar.md, `OrchestrationV2LimitRecovery` |
| 10 | Usage from transcripts: guard-hash resume + LiteLLM prices + SDK `get_usage` limits + cache-hit/premium columns (A8, U23) | Med-High, cost control | S-M | `indexer.ts`, `costs.ts`, `limits.ts`, `Limits.tsx` | `usage/*`, `claudeUsageLimits.ts` |
| 11 | Context window meter + "cache expired, compact?" prompt (U12) | Med-High, saves money | S-M | `Chat.tsx`, `adapters/claude.ts` | `ContextWindowMeter.logic.ts` |
| 12 | Checkpoint hardening: HEAD parent + authored-paths diff, fsync, embedded-repo recovery, restore-safety, provider-coordinated rollback (A5) | Med-High: data safety | S | `checkpoints.ts`, `worktrees.ts` | `GitVcsDriver.ts` L794-1115, `CheckpointRestoreSafety.ts` |
| 13 | Stream protocol hygiene: sequence cursor + `?after=N` resume, 50 ms delta coalescing, omit tool bodies, bounded history pages, back-pressure limit (A1, A9, A10) | Med-High | M | `bus.ts`, `chat-routes.ts`, web store | `ThreadLiveEventCoalescer.ts`, `LiveStreamBudget.ts`, `performance-regressions.md` |
| 14 | Keybindings with `when` contexts + palette `>` actions mode (U16, U17) | Medium | M | new `lib/keybindings.ts`, `CommandPalette.tsx` | `docs/user/keybindings.md`, `shared/keybindings.ts` |
| 15 | AGENTS.md + custom lint rules + knip + replay-based adapter tests (Q1, Q2, Q4) | Medium (dev quality), cheap | S-M | repo root, CI | `AGENTS.md`, `oxlint-plugin-t3code`, `testing-strategy.md` |

Runners-up (just below the line): webhook-triggered schedules (A13), settle/snooze sidebar model (U8),
provider switch with budgeted handoff (A7), diff line comments to chat (U14), plan-mode capture of
ExitPlanMode via deny (A3), request_secret (U21), composer paste-to-attachment + ArrowUp recall + stash (U9),
virtualized timeline (U13, important but L), per-project `t3.json`-style scripts (Q8).

---------------------------------------------------------------------------------------------------

## 5. Caveats and what I did not read

- Read in full or in substantial part: AGENTS.md, README, docs/internals/{overview,glossary,providers,web-ui,
  performance-regressions,environment-auth,connection-runtime,terminal-runtime,composer-editors,
  composer-context-references,t3-connect (first half)}, docs/orchestration-v2/{README,core-graph (first 400
  lines),provider-capability-system,orchestrator-mcp-server (first 260 lines),testing-strategy,feature-lifecycles
  (selected sections)}, docs/user/{composer,permission-modes,html-renders,thread-sidebar,keybindings,appearance,
  usage,portable-handoffs,welcome-wizard,activity-log,terminal,outside-agents,prompt-links,snap-shot,devices
  (first parts)}; code: markdown-incremental, incrementalHighlighting, lruCache, MermaidDiagram (top), WorkLog,
  work-log/presentation + commandLabel (top), ComposerPendingApproval*, ComposerBannerStack, ContextWindowMeter.logic,
  Sidebar.logic status pill, DiffWorkerPoolProvider, diffRendering (top), htmlRender (shared, theme part),
  orchestrationInstructions, ProviderAdapter.ts, CommandPolicy (top), EventSink/EffectOutbox (top),
  ThreadLiveEventCoalescer/LiveStreamBudget/CommandOutputHub (headers), GitVcsDriver checkpoint ops,
  CheckpointRestoreSafety (top), ClaudeAdapterV2 (options builder, permission mapping, canUseTool),
  usageTranscriptReader/claudeUsageLimits/usagePricing (tops), load-balancing, scheduledTask contract (top),
  pullRequestReviewGuide contract, contracts/orchestrationV2 type lists.
- NOT read in depth (so statements are from file names/docs only): Orchestrator.ts internals, ProviderSessionManager,
  CodexAdapterV2 body, ACP/Cursor/Grok/Pi/OpenCode/Antigravity/Muse adapters, apps/mobile, apps/desktop
  (Electron main, SnapShot native pipeline, SSH/WSL), infra/relay Worker code, native/ Rust and C code,
  ThreadSettlementService body (its behavior is from docs), the full ChatView/ChatComposer/MessagesTimeline bodies,
  settings screens, tests. Mark any claim about those as unverified.
- Guesses (marked in text): how God Eye spawns Claude Code today (SDK vs CLI stream-json); God Eye chat list
  virtualization (grep found no virtual list library, so likely none); `@pierre/diffs`, `@pierre/trees`,
  `@legendapp/list`, `libghostty-vt` licenses.
- T3 relies on Effect v4 beta throughout; do not import their server modules. Reuse pure TS helpers and patterns only.
- T3's own policy: AGENTS.md says "Most T3 Code contributions will come from T3 Code itself, often controlled
  remotely", so the codebase is shaped for agent contributors; the dense comments ("why" only) and lint
  against low-value comments are part of that.
