import { posix } from "node:path";
import type { ArchitectureReport, ArchPattern } from "@godeye/core";
import type { Snapshot } from "./snapshot";

/**
 * Architecture pattern of a project (plan.md 15.2), after Mark Richards, Software Architecture
 * Patterns (O'Reilly, 2015): which pattern the code follows, the evidence, and the pattern's own
 * rules. For the layered pattern that is "closed layers": a request goes down one layer at a time,
 * so presentation never reaches the database directly and no layer reaches up.
 */

const SOURCE = /\.(ts|tsx|js|jsx|mjs|py|go|rb|java|kt|cs|php)$/;
const TEST = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-z]+$/;

/** Folder names that mark a layer, top (presentation) to bottom (persistence). */
const LAYERS: [number, RegExp][] = [
  [0, /^(controllers?|routes?|handlers?|views?|pages|api|resolvers?|endpoints?)$/i],
  [1, /^(services?|usecases?|use-cases|domain|business|logic|application|core)$/i],
  [2, /^(repositor(y|ies)|repos?|models?|dal|db|database|persistence|data|entities|dao)$/i],
];

const BROKERS = [
  "kafkajs",
  "amqplib",
  "bullmq",
  "bull",
  "nats",
  "@aws-sdk/client-sqs",
  "@google-cloud/pubsub",
  "celery",
  "pika",
  "kombu",
  "sidekiq",
  "@nestjs/microservices",
  "eventemitter2",
  "rabbitmq",
];

function layerOf(path: string): number | undefined {
  for (const part of path.split("/").slice(0, -1)) {
    const hit = LAYERS.find(([, re]) => re.test(part));
    if (hit) return hit[0];
  }
  return undefined;
}

/** Relative imports of a file, resolved to repo paths (extension not needed: matched by prefix). */
function importsOf(path: string, text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'](\.[^"']*)["']/g))
    out.push(posix.normalize(posix.join(posix.dirname(path), m[1] ?? "")));
  return out;
}

/** Imports that break closed layers: skipping the business layer, or reaching up. */
function layerViolations(snap: Snapshot): ArchitectureReport["violations"] {
  const files = snap.files.filter((f) => SOURCE.test(f.path) && !TEST.test(f.path) && f.text);
  const layerByPrefix = (target: string) => {
    const f = files.find(
      (x) => x.path === target || x.path.startsWith(`${target}.`) || x.path.startsWith(`${target}/index.`),
    );
    return f ? layerOf(f.path) : layerOf(`${target}/x`);
  };
  const out: ArchitectureReport["violations"] = [];
  for (const f of files) {
    const from = layerOf(f.path);
    if (from === undefined) continue;
    for (const target of importsOf(f.path, f.text ?? "")) {
      const to = layerByPrefix(target);
      if (to === undefined || to === from) continue;
      if (to < from) out.push({ rule: "reachesUp", from: f.path, to: target });
      else if (to - from > 1) out.push({ rule: "skipsLayer", from: f.path, to: target });
      if (out.length >= 30) return out;
    }
  }
  return out;
}

/** Service folders: their own manifest and their own Dockerfile. */
function servicesOf(snap: Snapshot): string[] {
  const manifests = snap.files
    .map((f) => f.path)
    .filter(
      (p) =>
        /(^|\/)(package\.json|go\.mod|pyproject\.toml|requirements\.txt|pom\.xml|Cargo\.toml)$/.test(p) &&
        p.includes("/"),
    );
  const dirs = new Set(manifests.map((p) => posix.dirname(p)));
  return [...dirs].filter((d) => snap.byPath.has(`${d}/Dockerfile`)).slice(0, 20);
}

export function architectureOf(snap: Snapshot): ArchitectureReport {
  const evidence: string[] = [];
  const services = servicesOf(snap);
  const brokers = BROKERS.filter((b) => snap.deps.has(b));
  const plugins = snap.files.some((f) =>
    /(^|\/)(plugins?|extensions?|addons?)\/[^/]+\/(manifest\.json|index\.[jt]s|plugin\.[jt]s)$/.test(f.path),
  );
  const layered = new Set(snap.files.map((f) => layerOf(f.path)).filter((l) => l !== undefined));
  let pattern: ArchPattern = "unknown";
  if (services.length >= 2) {
    pattern = "microservices";
    evidence.push(`services:${services.join(", ")}`);
  } else if (brokers.length) {
    pattern = "eventDriven";
    evidence.push(`brokers:${brokers.join(", ")}`);
  } else if (plugins) {
    pattern = "microkernel";
    evidence.push("plugins");
  } else if (layered.size >= 2) {
    pattern = "layered";
    evidence.push(`layers:${[...layered].sort().join(",")}`);
  }
  // Brokers inside services or a layered core are worth naming as well.
  if (pattern !== "eventDriven" && brokers.length) evidence.push(`brokers:${brokers.join(", ")}`);
  return { pattern, evidence, violations: pattern === "layered" ? layerViolations(snap) : [] };
}
