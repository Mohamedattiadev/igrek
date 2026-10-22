import type { ChatEvent } from "@igrek/core";

/** Files worth opening on the spot: what people ask a chat to make (a PDF, a picture, an office file). */
const MADE =
  /(?:^|[\s"'`(=:])((?:~?\/|\.{1,2}\/)?(?:[\w@.+-]+\/)*[\w@+-][\w@.+-]*?\.(?:pdf|png|jpe?g|webp|gif|svg|docx|xlsx|pptx))(?=$|[\s"'`),;:]|\.(?:\s|$))/gim;
const MAX = 8;

function join(cwd: string, path: string): string {
  if (path.startsWith("/")) return path;
  const parts = cwd.split("/");
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "." && part) parts.push(part);
  }
  return parts.join("/");
}

/** Text a step or an answer carries where a file it made may be named. */
function texts(event: ChatEvent): string[] {
  if (event.kind === "text") return [event.text];
  if (event.kind !== "tool") return [];
  const input = (event.input ?? {}) as { file_path?: unknown; command?: unknown };
  return [input.file_path, input.command, event.result].filter((v): v is string => typeof v === "string");
}

/**
 * The PDFs, pictures and office files a chat made or named, newest first, as paths on this computer.
 * Names in a step or an answer count too, since a script the AI ran writes the file, not an edit.
 */
export function madeFiles(events: ChatEvent[], cwd: string): string[] {
  const found: string[] = [];
  for (const event of events)
    for (const text of texts(event))
      for (const m of text.matchAll(MADE)) {
        const raw = m[1]?.trim();
        if (!raw || raw.startsWith("~") || /^https?:/.test(raw) || raw.includes("://")) continue;
        const path = join(cwd, raw);
        const at = found.indexOf(path);
        if (at >= 0) found.splice(at, 1);
        found.push(path);
      }
  return found.reverse().slice(0, MAX);
}
