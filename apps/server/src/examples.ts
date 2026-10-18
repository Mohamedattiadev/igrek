import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type SessionSummaryData, scrub } from "@igrek/core";
import type { Library } from "./library";
import type { Store } from "./store";

const SECTIONS: Record<string, string> = {
  decision: "Decisions",
  convention: "Conventions",
  failed: "Tried and did not work",
  issue: "Known problems",
};

/**
 * Every project becomes an "example project" in the library (plan.md 7.1): what it is, the
 * decisions made, what failed, and what the recent sessions did. Personas can then say
 * "in PoultryCare you solved this with…". Secrets are removed; nothing changes when the text is the same.
 */
export function syncExamples(store: Store, library: Library): number {
  let written = 0;
  for (const project of store.listProjects()) {
    if (project.hidden || project.workspace !== "local") continue;
    const parts: string[] = [`# ${project.name}`];
    const readme = ["README.md", "readme.md", "README"].map((f) => join(project.path, f)).find((p) => existsSync(p));
    if (readme) parts.push(`## README\n${readFileSync(readme, "utf8").slice(0, 4000)}`);
    const memory = store.listMemory(project.id, false);
    for (const [section, heading] of Object.entries(SECTIONS)) {
      const items = memory.filter((m) => m.section === section).slice(0, 15);
      if (items.length) parts.push(`## ${heading}\n${items.map((m) => `- ${m.text}`).join("\n")}`);
    }
    const sessions = store
      .listSessions(project.id, 30)
      .filter((s) => s.summary)
      .slice(0, 15)
      .map((s) => {
        const summary = s.summary as SessionSummaryData;
        const text = summary.texts.en ?? Object.values(summary.texts)[0];
        return `- ${new Date(s.updatedAt).toISOString().slice(0, 10)} ${summary.title || s.title}: ${text?.did.join("; ") ?? ""}`;
      });
    if (sessions.length) parts.push(`## What was done\n${sessions.join("\n")}`);
    if (parts.length < 2) continue;
    library.upsertText({
      id: `example-${project.id}`,
      kind: "example",
      title: `Example project: ${project.name}`,
      text: scrub(parts.join("\n\n")),
    });
    written++;
  }
  return written;
}
