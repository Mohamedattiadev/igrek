import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_PERSONAS, type CatalogEntry, type FlowDef, type PackPreview, type Persona } from "@igrek/core";
import { parseFlow } from "./flows";
import { BUILTIN_FLOWS } from "./flows-builtin";
import { type Personas, personaLabel, sanitizePersona } from "./personas";

/**
 * Packages of experts and team flows to share (plan.md 10): one file, made from your own experts
 * and flows, opened from a file, an address or Igrek's own catalog. The rules are strict because a
 * package comes from someone else: what it holds is shown before anything is saved, its experts
 * always start read-only and off the web, flows that run shell commands are refused, and its flows
 * go to Igrek's own folder, never into a project's repository.
 */
const PACK_FORMAT = "igrek-pack";
/** The curated list, in Igrek's own repository: packages are added there by review only. */
const CATALOG_URL = "https://raw.githubusercontent.com/Mohamedattiadev/igrek/main/market/index.json";
const MAX_BYTES = 1024 * 1024;
const FLOW_NAME = /^[a-z0-9][a-z0-9-]{1,40}$/;

export interface Pack {
  format: typeof PACK_FORMAT;
  version: 1;
  name: string;
  description?: string;
  author?: string;
  personas: unknown[];
  /** Each flow as its YAML text, the format of .igrek/flows. */
  flows: { name: string; yaml: string }[];
}

function asPack(raw: unknown): Pack {
  const pack = (raw ?? {}) as Partial<Pack>;
  if (pack.format !== PACK_FORMAT || pack.version !== 1) throw new Error("This is not an Igrek package");
  const name = typeof pack.name === "string" ? pack.name.trim().slice(0, 80) : "";
  if (!name) throw new Error("The package has no name");
  return {
    format: PACK_FORMAT,
    version: 1,
    name,
    description: typeof pack.description === "string" ? pack.description.slice(0, 500) : undefined,
    author: typeof pack.author === "string" ? pack.author.slice(0, 80) : undefined,
    personas: Array.isArray(pack.personas) ? pack.personas.slice(0, 30) : [],
    flows: (Array.isArray(pack.flows) ? pack.flows : [])
      .filter((f): f is { name: string; yaml: string } => typeof f?.name === "string" && typeof f?.yaml === "string")
      .slice(0, 20),
  };
}

/** Why a flow from a package is refused, or nothing when it may come in. */
function flowProblem(flow: FlowDef, name: string): string | undefined {
  if (!FLOW_NAME.test(name) || flow.name !== name) return "badName";
  if (name in BUILTIN_FLOWS) return "builtinName";
  // A stranger's shell command would run on your computer with your rights.
  if (flow.nodes.some((node) => node.bash)) return "shell";
  return undefined;
}

export class PersonaPacks {
  constructor(
    private readonly personas: Personas,
    /** Where flows from packages are kept (Flows.marketDir). */
    private readonly flowDir: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /** Your own experts (and built-ins you changed) and your package flows, as one file to share. */
  build(input: { name: string; description?: string; author?: string; personaIds: string[]; flows: string[] }): Pack {
    const personas = input.personaIds.map((id) => {
      const persona = this.personas.get(id);
      if (!persona) throw new Error(`No expert called ${id}`);
      const { builtin: _b, edited: _e, updatedAt: _u, ...data } = persona;
      return data;
    });
    const flows = input.flows.map((name) => {
      const file = join(this.flowDir, `${name}.yaml`);
      if (!FLOW_NAME.test(name) || !existsSync(file)) throw new Error(`No package flow called ${name}`);
      return { name, yaml: readFileSync(file, "utf8") };
    });
    return asPack({ format: PACK_FORMAT, version: 1, ...input, personas, flows });
  }

  /** What a package would add, without saving anything. */
  preview(raw: unknown): PackPreview {
    const pack = asPack(raw);
    return {
      name: pack.name,
      description: pack.description,
      author: pack.author,
      personas: pack.personas.flatMap((input) => {
        try {
          const persona = sanitizePersona(input);
          const { name, role } = personaLabel(persona);
          return [
            {
              id: persona.id,
              name,
              role,
              exists: !!this.personas.get(persona.id),
              asked: { tools: persona.tools, web: persona.web },
            },
          ];
        } catch {
          return [];
        }
      }),
      flows: pack.flows.map(({ name, yaml }) => {
        try {
          const flow = parseFlow(yaml, "market");
          const reason = flowProblem(flow, name);
          return {
            name,
            description: flow.description,
            steps: flow.nodes.length,
            ok: !reason,
            reason,
            exists: existsSync(join(this.flowDir, `${name}.yaml`)),
          };
        } catch {
          return { name, steps: 0, ok: false, reason: "unreadable", exists: false };
        }
      }),
    };
  }

  /**
   * Saves what the user picked from a package. Experts that already exist here are never replaced;
   * every expert from a package starts read-only and without the web (the user may change that later).
   */
  install(raw: unknown, pick: { personas: string[]; flows: string[] }): { personas: string[]; flows: string[] } {
    const pack = asPack(raw);
    const preview = this.preview(pack);
    const saved = { personas: [] as string[], flows: [] as string[] };
    for (const input of pack.personas) {
      let persona: Persona;
      try {
        persona = sanitizePersona(input);
      } catch {
        continue;
      }
      if (!pick.personas.includes(persona.id) || this.personas.get(persona.id)) continue;
      if (BUILTIN_PERSONAS.some((b) => b.id === persona.id)) continue;
      this.personas.save({ ...persona, tools: "read", web: false });
      saved.personas.push(persona.id);
    }
    mkdirSync(this.flowDir, { recursive: true });
    for (const { name, yaml } of pack.flows) {
      const seen = preview.flows.find((f) => f.name === name);
      if (!pick.flows.includes(name) || !seen?.ok) continue;
      writeFileSync(join(this.flowDir, `${name}.yaml`), yaml);
      saved.flows.push(name);
    }
    return saved;
  }

  /** The flows that came from packages, by name. */
  flows(): string[] {
    try {
      return readdirSync(this.flowDir)
        .filter((f) => f.endsWith(".yaml"))
        .map((f) => f.slice(0, -5));
    } catch {
      return [];
    }
  }

  /** A package from an https address, at most 1 MB. */
  async fetchPack(url: string): Promise<unknown> {
    const u = new URL(url);
    if (u.protocol !== "https:") throw new Error("Give an https address");
    const res = await this.fetcher(u, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`The address answered ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error("The package is larger than 1 MB");
    return JSON.parse(text);
  }

  /** Igrek's curated catalog: reviewed packages, each with its address. */
  async catalog(): Promise<CatalogEntry[]> {
    const raw = (await this.fetchPack(CATALOG_URL)) as { packs?: unknown };
    return (Array.isArray(raw.packs) ? raw.packs : [])
      .filter(
        (p): p is CatalogEntry =>
          typeof p?.name === "string" && typeof p?.url === "string" && p.url.startsWith("https://"),
      )
      .map((p) => ({
        name: p.name.slice(0, 80),
        description: String(p.description ?? "").slice(0, 300),
        author: String(p.author ?? "").slice(0, 80),
        url: p.url,
      }))
      .slice(0, 100);
  }
}
