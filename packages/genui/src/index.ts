import { createLibrary, defineComponent, tagSchemaId } from "@openuidev/lang-core";
import { z } from "zod";

/**
 * Igrek's OpenUI components (plan.md 16.2): what each one is called, what it is for and its
 * arguments. Shared so the server can teach them to the AI and the web app can draw them with
 * its own React pieces. Arguments are positional: add new ones only at the end, never reorder
 * or remove one, or saved reports stop drawing.
 */

// OpenUI's opt-in runtime telemetry stays off even if someone sets the opt-in variable.
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
if (env) env.OPENUI_TELEMETRY_DISABLED ??= "1";

const tone = z.enum(["good", "warning", "bad", "neutral"]);
/** What a button does: Action([@ToAssistant("…")]) sends a message to the chat, @OpenUrl opens a web page. */
const action = z.any();
tagSchemaId(action, "ActionExpression");
export const CALLOUT_KINDS = ["note", "tip", "important", "warning", "caution"] as const;

export const SCHEMAS = {
  Stack: {
    description: "Places its children one under the other (column) or side by side (row).",
    props: z.object({
      children: z.array(z.any()).describe("The components inside"),
      direction: z.enum(["column", "row"]).optional().describe("column (default) or row"),
    }),
  },
  Card: {
    description: "A bordered box with a title around related content.",
    props: z.object({
      title: z.string().describe("Short heading"),
      children: z.array(z.any()).describe("The components inside"),
    }),
  },
  Text: {
    description: "A paragraph of Markdown text.",
    props: z.object({ markdown: z.string().describe("Markdown text") }),
  },
  Stats: {
    description: "A few headline numbers as tiles.",
    props: z.object({
      items: z
        .array(z.object({ label: z.string(), value: z.string(), delta: z.string().optional(), tone: tone.optional() }))
        .describe("One tile per number; value is text"),
    }),
  },
  Chart: {
    description: "A bar chart (bar, or hbar for long names) or a line chart for change over time.",
    props: z.object({
      type: z.enum(["bar", "hbar", "line"]),
      title: z.string(),
      labels: z.array(z.string()).describe("One label per point or bar"),
      series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })).describe("Numbers, one per label"),
      unit: z.string().optional(),
    }),
  },
  Progress: {
    description: "Meters for parts of a whole or how far something is.",
    props: z.object({
      items: z.array(z.object({ label: z.string(), value: z.number(), max: z.number().optional() })),
    }),
  },
  Table: {
    description: "A small table: column names and rows of cells.",
    props: z.object({
      columns: z.array(z.string()),
      rows: z.array(z.array(z.union([z.string(), z.number()]))),
    }),
  },
  Callout: {
    description: "A highlighted note, tip or warning.",
    props: z.object({ kind: z.enum(CALLOUT_KINDS), text: z.string() }),
  },
  Button: {
    description: "A button; its action asks the assistant a follow-up (@ToAssistant) or opens a web page (@OpenUrl).",
    props: z.object({ label: z.string(), action }),
  },
  Code: {
    description: "A block of code or a command.",
    props: z.object({ language: z.string().describe("sh, ts, py, sql…"), code: z.string() }),
  },
};

export type ComponentName = keyof typeof SCHEMAS;
export const ROOT: ComponentName = "Stack";
export const LIBRARY_ID = "igrek@1";

/** What tells the AI how to add ```openui-lang blocks to a report written in Markdown. */
export function reportUiHint(): string {
  const library = createLibrary({
    id: LIBRARY_ID,
    root: ROOT,
    components: Object.entries(SCHEMAS).map(([name, s]) =>
      defineComponent({ name, description: s.description, props: s.props, component: null }),
    ),
  });
  return library.prompt({
    inlineMode: true,
    preamble:
      "You write a report in Markdown. Where numbers or structure read better as a picture, add a fenced ```openui-lang block in a small UI language, described below. Everything else stays Markdown.",
    additionalRules: [
      "Use only the components listed here. Stats values are text; Chart and Progress values are numbers.",
      "Keep each block small: one to six components. Never put the whole report in a block.",
      "No emoji anywhere.",
    ],
  });
}
