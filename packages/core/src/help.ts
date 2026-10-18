/**
 * The in-app guide (plan.md 13.6): every part of God Eye in a sentence, with where it is. Titles
 * and texts are translated (help.t_<id>, help.d_<id>); the helper answers questions from them.
 */
export const HELP_TOPICS: { id: string; path: string; words: string }[] = [
  { id: "ask", path: "/", words: "prompt write type ask box home start chat message where" },
  { id: "projects", path: "/", words: "project folder add new template status archive focus" },
  { id: "sessions", path: "/", words: "session claude codex gemini history transcript summary health tired" },
  { id: "chat", path: "/", words: "chat new conversation persona model plan mode approve" },
  { id: "terminals", path: "/terminals", words: "terminal shell run command" },
  { id: "memory", path: "/", words: "memory decision convention rule failed issue adr" },
  { id: "inbox", path: "/inbox", words: "inbox notification approval waiting attention" },
  { id: "limits", path: "/limits", words: "limit usage tokens account switch quota" },
  { id: "personas", path: "/personas", words: "persona team expert meeting notebook arena" },
  { id: "board", path: "/", words: "board task card team run flow feature fix roadmap sprint gantt import" },
  { id: "schedules", path: "/schedules", words: "schedule every night weekly cron later" },
  { id: "preview", path: "/", words: "preview live click element change ui" },
  { id: "sections", path: "/", words: "sections score security tests performance categories" },
  { id: "library", path: "/library", words: "library book pdf lessons knowledge news" },
  { id: "servers", path: "/servers", words: "server ssh deploy environment staging production env" },
  {
    id: "tools",
    path: "/tools",
    words: "tools uptime domain ssl docker logs database backups calendar vault costs time plugins",
  },
  { id: "monitoring", path: "/", words: "monitoring errors logs incident analytics feedback performance" },
  { id: "docs", path: "/", words: "wiki whiteboard board drawing excalidraw diagram release notes launch docs site" },
  { id: "github", path: "/", words: "github gitlab issue pull request review ci" },
  { id: "team", path: "/team", words: "team share sync encrypted invite chat channel board" },
  { id: "briefing", path: "/", words: "morning briefing evening recap day end weekly report ceo" },
  { id: "files", path: "/files", words: "files editor code open folder" },
  { id: "prompts", path: "/prompts", words: "prompt library enhancer coach shortcut" },
  { id: "ideas", path: "/ideas", words: "idea capture ctrl i" },
  {
    id: "settings",
    path: "/settings",
    words: "settings language theme local model ollama mcp bridges telegram discord email backup update disk network",
  },
  { id: "cli", path: "/settings", words: "cli command line godeye script api" },
  { id: "safety", path: "/settings", words: "safe secret key push deploy stop privacy telemetry" },
];

/**
 * Told to chats and reports so answers can show data the way the app draws it (the web app turns
 * these fenced blocks into charts, stat tiles, meters and diagrams).
 */
export const RICH_BLOCKS_HINT = [
  "When numbers or structure are clearer as a picture, you can use fenced blocks that the God Eye app draws (only then; plain text otherwise):",
  '```chart\n{"type":"bar","title":"…","unit":"…","labels":["…"],"series":[{"name":"…","values":[1,2]}]}\n``` (type: bar, hbar for long category names, line for change over time);',
  '```stats\n[{"label":"…","value":"…","delta":"+3","tone":"good"}]\n``` (tone: good, warning, bad; for a few headline numbers);',
  '```progress\n[{"label":"…","value":72,"max":100}]\n``` (for parts of a whole or how far something is);',
  "```mermaid``` for flows and diagrams. The JSON must be valid; numbers in values, never text.",
  "```html-report``` for a whole self-contained HTML page (inline CSS and JS only; it cannot load anything from the network), when the user asks for a page or a rich report.",
].join("\n");
