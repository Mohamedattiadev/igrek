import { homedir } from "node:os";
import { APP_VERSION, findPrivateShapes, hidePrivate } from "@igrek/core";
import type { Hono } from "hono";

/**
 * "Report a problem" (plan.md 7.2): what a useful bug report needs, prepared here and shown to the user
 * before anything leaves. Igrek sends nothing itself: the page opens a GitHub issue with this text only
 * when the user chooses to. The last lines Igrek printed are kept in memory for it (never on disk).
 */
const KEEP = 150;
const lines: string[] = [];

/** Keeps a copy of what the server prints (it still goes to the terminal or the app's log as before). */
export function keepRecentLog(): void {
  for (const level of ["log", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      const text = args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : String(a))).join(" ");
      lines.push(`${level === "log" ? "" : `[${level}] `}${text}`.slice(0, 2000));
      if (lines.length > KEEP) lines.splice(0, lines.length - KEEP);
      original(...args);
    };
  }
}

/** Private details out: saved values and .env secrets, shapes (IBAN, card, ID, money), the home folder. */
export function scrub(text: string, secret: { name: string; value: string }[], home = homedir()): string {
  let out = hidePrivate(text, secret).text;
  for (const found of findPrivateShapes(out).reverse())
    out = `${out.slice(0, found.start)}[hidden]${out.slice(found.end)}`;
  // Tokens and keys that look like one (long runs of letters and digits after "key", "token", "secret").
  out = out.replace(
    /((?:key|token|secret|password|authorization)[^\n]{0,12}?[:=\s]\s*)["']?[\w\-.+/=]{16,}/gi,
    "$1[hidden]",
  );
  return home ? out.split(home).join("~") : out;
}

export function reportText(
  info: { platform: string; arch: string; runtime: string; desktop: boolean },
  log: string[],
  secret: { name: string; value: string }[],
): string {
  const system = `Igrek ${APP_VERSION}, ${info.desktop ? "desktop app" : "browser"}, ${info.platform} ${info.arch}, ${info.runtime}`;
  const recent = log.slice(-60).join("\n");
  return scrub(
    [
      "**What happened, and what did you expect?**",
      "",
      "",
      "**Steps to see it**",
      "",
      "",
      `**System:** ${system}`,
      "",
      "<details><summary>Igrek's last log lines</summary>",
      "",
      "```",
      recent || "(nothing yet)",
      "```",
      "</details>",
    ].join("\n"),
    secret,
  );
}

export function registerReportRoutes(app: Hono, secret: () => { name: string; value: string }[]): void {
  app.get("/api/report", (c) =>
    c.json({
      text: reportText(
        {
          platform: process.platform,
          arch: process.arch,
          runtime: `Bun ${Bun.version}`,
          desktop: !!process.env.IGREK_RESOURCES,
        },
        lines,
        secret(),
      ),
    }),
  );
}
