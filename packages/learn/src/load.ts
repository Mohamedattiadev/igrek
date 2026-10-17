import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Roadmap, type Sheet, validateRoadmap, validateSheet } from "./index";

/** Where the hand-written content lives. */
export const CONTENT_DIR = join(import.meta.dir, "..", "content");

function yamlFiles(dir: string): string[] {
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".yaml"))
        .sort()
    : [];
}

export interface Content {
  sheets: Sheet[];
  roadmaps: Roadmap[];
  /** Problems found while loading; files with problems are left out. */
  errors: string[];
}

/** Reads and checks every cheatsheet and roadmap. A broken file is skipped, never shown half. */
export function loadContent(dir = CONTENT_DIR): Content {
  const errors: string[] = [];
  const read = (sub: string): { file: string; data: unknown }[] =>
    yamlFiles(join(dir, sub)).flatMap((file) => {
      try {
        return [{ file, data: Bun.YAML.parse(readFileSync(join(dir, sub, file), "utf8")) }];
      } catch (e) {
        errors.push(`${sub}/${file}: ${(e as Error).message}`);
        return [];
      }
    });
  const sheets: Sheet[] = [];
  for (const { file, data } of read("sheets")) {
    const problems = validateSheet(data, file);
    if ((data as Sheet)?.id && `${(data as Sheet).id}.yaml` !== file) problems.push(`${file}: id does not match file`);
    if (problems.length) errors.push(...problems);
    else sheets.push(data as Sheet);
  }
  const raw = read("roadmaps");
  // Steps of every roadmap, so "react/setup" style links between roadmaps can be checked.
  const known = new Set(
    raw.flatMap(({ data }) => ((data as Roadmap)?.steps ?? []).map((s) => `${(data as Roadmap).id}/${s?.id}`)),
  );
  const roadmaps: Roadmap[] = [];
  for (const { file, data } of raw) {
    const problems = validateRoadmap(data, file, known);
    if ((data as Roadmap)?.id && `${(data as Roadmap).id}.yaml` !== file)
      problems.push(`${file}: id does not match file`);
    if (problems.length) errors.push(...problems);
    else roadmaps.push(data as Roadmap);
  }
  const sheetIds = new Set(sheets.map((s) => s.id));
  const roadmapIds = new Set(roadmaps.map((r) => r.id));
  // A sheet may name a roadmap that is not written yet; the link is shown once it exists.
  for (const s of sheets) if (s.roadmap && !roadmapIds.has(s.roadmap)) delete s.roadmap;
  for (const r of roadmaps) {
    for (const id of r.sheets ?? []) if (!sheetIds.has(id)) errors.push(`${r.id}: unknown sheet ${id}`);
    for (const id of r.after ?? []) if (!roadmapIds.has(id)) errors.push(`${r.id}: unknown roadmap ${id}`);
  }
  return { sheets, roadmaps, errors };
}
