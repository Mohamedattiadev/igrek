# God Eye architecture (C4)

<!-- Written by `bun scripts/c4.ts` from the code; do not edit by hand. A test fails when it is out of date. -->

Three of the four C4 levels (Simon Brown, c4model.com). The fourth, code, is the source itself. The rules these
pictures must keep are in `scripts/arch-check.ts` (`bun run lint:arch`).

## 1. Context

```mermaid
C4Context
  Person(user, "Developer", "Works with AI coding tools on their own projects")
  System(godeye, "God Eye", "Runs on the developer's computer: sees, explains and steers their AI coding work")
  System_Ext(ai, "AI coding CLIs", "Claude Code, Codex, Gemini: their session files and processes")
  System_Ext(git, "Git hosts", "GitHub, GitLab, through the user's own gh and glab logins")
  System_Ext(servers, "User's servers", "Reached over SSH for deploys and checks")
  System_Ext(hub, "Team hub", "Optional, self-hosted, end-to-end encrypted")
  Rel(user, godeye, "Uses", "Browser")
  Rel(godeye, ai, "Reads sessions, starts chats")
  Rel(godeye, git, "Issues, pull requests, CI")
  Rel(godeye, servers, "Deploys, health", "SSH")
  Rel(godeye, hub, "Shares chosen projects", "HTTPS")
```

## 2. Containers

```mermaid
C4Container
  Person(user, "Developer")
  System_Boundary(ge, "God Eye") {
    Container(apps_web, "Web app", "React, Vite", "Everything the user sees, in the browser")
    Container(apps_server, "Server", "Bun, SQLite", "Reads AI sessions, runs chats, terminals, checks and jobs")
    Container(apps_hub, "Team hub", "Bun", "End-to-end encrypted relay for teams; deployed on its own")
    Container(packages_core, "core", "TypeScript", "Shared types and rules")
    Container(packages_i18n, "i18n", "TypeScript, JSON", "Interface texts in every language")
    Container(packages_learn, "learn", "TypeScript, YAML", "Cheat sheets and roadmaps")
    Container(packages_genui, "genui", "TypeScript, OpenUI", "The UI components the AI may use in reports")
  }
  Rel(user, apps_web, "Uses", "Browser")
  Rel(apps_web, apps_server, "Calls", "HTTP, WebSocket")
  Rel(apps_server, packages_core, "imports")
  Rel(apps_server, packages_genui, "imports")
  Rel(apps_server, packages_i18n, "imports")
  Rel(apps_server, packages_learn, "imports")
  Rel(apps_web, packages_core, "imports")
  Rel(apps_web, packages_genui, "imports")
  Rel(apps_web, packages_i18n, "imports")
  Rel(apps_web, packages_learn, "imports")
```

## 3. Components of the server

Server modules grouped by area (matched on file names in `scripts/c4.ts`); an arrow means one area imports the other.

```mermaid
C4Component
  Container_Boundary(server, "Server") {
    Component(sync, "Team sync", "TypeScript")
    Component(preview, "Live preview", "TypeScript")
    Component(insight, "Quality and insight", "TypeScript")
    Component(sessions, "Session reading", "TypeScript")
    Component(chat, "Chats and terminals", "TypeScript")
    Component(agents, "Personas, flows and jobs", "TypeScript")
    Component(ops, "Servers and operations", "TypeScript")
    Component(knowledge, "Learning and knowledge", "TypeScript")
    Component(api, "HTTP API and app", "TypeScript")
  }
  Rel(agents, api, "uses")
  Rel(agents, chat, "uses")
  Rel(agents, insight, "uses")
  Rel(agents, knowledge, "uses")
  Rel(agents, ops, "uses")
  Rel(agents, sessions, "uses")
  Rel(api, agents, "uses")
  Rel(api, chat, "uses")
  Rel(api, insight, "uses")
  Rel(api, knowledge, "uses")
  Rel(api, ops, "uses")
  Rel(api, preview, "uses")
  Rel(api, sessions, "uses")
  Rel(api, sync, "uses")
  Rel(chat, api, "uses")
  Rel(chat, insight, "uses")
  Rel(chat, knowledge, "uses")
  Rel(chat, ops, "uses")
  Rel(chat, sessions, "uses")
  Rel(chat, sync, "uses")
  Rel(insight, agents, "uses")
  Rel(insight, api, "uses")
  Rel(insight, knowledge, "uses")
  Rel(insight, ops, "uses")
  Rel(insight, sessions, "uses")
  Rel(insight, sync, "uses")
  Rel(knowledge, agents, "uses")
  Rel(knowledge, api, "uses")
  Rel(knowledge, insight, "uses")
  Rel(knowledge, ops, "uses")
  Rel(knowledge, sessions, "uses")
  Rel(ops, agents, "uses")
  Rel(ops, api, "uses")
  Rel(ops, chat, "uses")
  Rel(ops, insight, "uses")
  Rel(ops, knowledge, "uses")
  Rel(ops, sessions, "uses")
  Rel(preview, agents, "uses")
  Rel(preview, api, "uses")
  Rel(preview, chat, "uses")
  Rel(preview, ops, "uses")
  Rel(preview, sessions, "uses")
  Rel(sessions, agents, "uses")
  Rel(sessions, api, "uses")
  Rel(sessions, insight, "uses")
  Rel(sessions, knowledge, "uses")
  Rel(sessions, ops, "uses")
  Rel(sync, api, "uses")
  Rel(sync, chat, "uses")
  Rel(sync, sessions, "uses")
```
