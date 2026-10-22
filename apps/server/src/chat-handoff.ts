import { type ChatEvent, hidePrivate } from "@igrek/core";

const EDITS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const MAX_ASKS = 8;
/** Igrek does not put values back into Codex's work, so the user fills them in themselves. */
const LEFT_OUT =
  "Some of my private details were left out and appear as [[private:name]]. Never guess them; when a step needs one, tell me and I will fill it in.";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

/**
 * The opening message for another tool (Codex) that picks up a live chat, for example when Claude's
 * usage limit is spent. It is built from the chat itself, not by a model, so it costs nothing and
 * works while the limit is hit: what the user asked, the AI's last answer, the files it changed.
 * Codex talks to OpenAI directly, not through Igrek's gateway, so private values are hidden here.
 */
export function chatHandoffPrompt(
  chat: { title: string; branch?: string },
  events: ChatEvent[],
  values: { name: string; value: string }[] = [],
): string {
  const asks = events
    .filter((e): e is Extract<ChatEvent, { kind: "user" }> => e.kind === "user" && Boolean(e.text.trim()))
    .slice(-MAX_ASKS)
    .map((e) => `- ${clip(e.text.trim().replace(/\s+/g, " "), 600)}`);
  const answer = [...events].reverse().find((e) => e.kind === "text" && e.text.trim());
  const files = new Set<string>();
  for (const e of events) {
    const path = e.kind === "tool" && EDITS.has(e.name) ? (e.input as { file_path?: unknown }).file_path : undefined;
    if (typeof path === "string") files.add(path);
  }
  const lines = [
    `We are continuing a chat that was started in Claude Code ("${chat.title}"); its usage limit ran out, so you take over.`,
    asks.length ? `What I asked for:\n${asks.join("\n")}` : "",
    answer?.kind === "text" ? `Claude's last answer:\n${clip(answer.text.trim(), 1500)}` : "",
    chat.branch ? `Branch: ${chat.branch}` : "",
    files.size
      ? `Files it changed:\n${[...files]
          .slice(-15)
          .map((f) => `- ${f}`)
          .join("\n")}`
      : "",
    "Start by checking the current state of the code (git status, the files involved) before changing anything, then tell me in two sentences where we are and what you'll do next.",
  ];
  const { text, hidden } = hidePrivate(lines.filter(Boolean).join("\n\n"), values);
  return hidden.length ? `${text}\n\n${LEFT_OUT}` : text;
}
