import { createLibrary, defineComponent, Renderer } from "@openuidev/react-lang";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { CodeBlock } from "./CodeBlock";
import { Markdown } from "./Markdown";
import { RichBlock } from "./RichBlocks";

/**
 * OpenUI (plan.md 16.2): the model writes a small UI language in a ```openui block and it is drawn
 * with God Eye's own pieces, so colors, dark mode and code highlighting stay the same. Only
 * @openuidev/react-lang and lang-core are used (MIT); their install telemetry never runs (see
 * openui-telemetry.test.ts). Arguments are positional: add new props only at the end, never
 * reorder or remove one, or saved answers stop drawing.
 */

const tone = z.enum(["good", "warning", "bad", "neutral"]);

const Stack = defineComponent({
  name: "Stack",
  description: "Places its children one under the other (column) or side by side (row).",
  props: z.object({
    children: z.array(z.any()).describe("The components inside"),
    direction: z.enum(["column", "row"]).optional().describe("column (default) or row"),
  }),
  component: ({ props, renderNode }) => (
    <div className={props.direction === "row" ? "flex flex-wrap gap-3 [&>*]:min-w-0 [&>*]:flex-1" : "space-y-3"}>
      {(props.children ?? []).map((child, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: children have no identity of their own
        <div key={i}>{renderNode(child)}</div>
      ))}
    </div>
  ),
});

const Card = defineComponent({
  name: "Card",
  description: "A bordered box with a title around related content.",
  props: z.object({
    title: z.string().describe("Short heading"),
    children: z.array(z.any()).describe("The components inside"),
  }),
  component: ({ props, renderNode }) => (
    <section className="not-prose space-y-2 rounded-ui border border-border bg-bg p-3">
      {props.title && <h4 className="text-[13px] font-semibold">{props.title}</h4>}
      {(props.children ?? []).map((child, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: children have no identity of their own
        <div key={i}>{renderNode(child)}</div>
      ))}
    </section>
  ),
});

const Text = defineComponent({
  name: "Text",
  description: "A paragraph of Markdown text.",
  props: z.object({ markdown: z.string().describe("Markdown text") }),
  component: ({ props }) => <Markdown text={props.markdown ?? ""} />,
});

const Stats = defineComponent({
  name: "Stats",
  description: "A few headline numbers as tiles.",
  props: z.object({
    items: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
          delta: z.string().optional(),
          tone: tone.optional(),
        }),
      )
      .describe("One tile per number"),
  }),
  component: ({ props }) => <RichBlock lang="stats" code={JSON.stringify(props.items ?? [])} />,
});

const Chart = defineComponent({
  name: "Chart",
  description: "A bar chart (bar, or hbar for long names) or a line chart for change over time.",
  props: z.object({
    type: z.enum(["bar", "hbar", "line"]),
    title: z.string(),
    labels: z.array(z.string()).describe("One label per point or bar"),
    series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })).describe("Numbers, one per label"),
    unit: z.string().optional(),
  }),
  component: ({ props }) => <RichBlock lang="chart" code={JSON.stringify(props)} />,
});

const Progress = defineComponent({
  name: "Progress",
  description: "Meters for parts of a whole or how far something is.",
  props: z.object({
    items: z.array(z.object({ label: z.string(), value: z.number(), max: z.number().optional() })),
  }),
  component: ({ props }) => <RichBlock lang="progress" code={JSON.stringify(props.items ?? [])} />,
});

const Table = defineComponent({
  name: "Table",
  description: "A small table: column names and rows of cells.",
  props: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.array(z.union([z.string(), z.number()]))),
  }),
  component: ({ props }) => (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            {(props.columns ?? []).map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(props.rows ?? []).map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity of their own
            <tr key={i}>
              {row.map((cell, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: cells have no identity of their own
                <td key={j}>{String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
});

const CALLOUTS = ["note", "tip", "important", "warning", "caution"] as const;

function CalloutBox({ kind, text }: { kind: (typeof CALLOUTS)[number]; text: string }) {
  const { t } = useTranslation();
  return (
    <blockquote className={`ge-callout ge-callout-${kind}`}>
      <span className="ge-callout-title">{t(`rich.callout_${kind}`)}</span>
      <p>{text}</p>
    </blockquote>
  );
}

const Callout = defineComponent({
  name: "Callout",
  description: "A highlighted note, tip or warning.",
  props: z.object({ kind: z.enum(CALLOUTS), text: z.string() }),
  component: ({ props }) => <CalloutBox kind={props.kind ?? "note"} text={props.text ?? ""} />,
});

const Code = defineComponent({
  name: "Code",
  description: "A block of code or a command.",
  props: z.object({ language: z.string().describe("sh, ts, py, sql…"), code: z.string() }),
  component: ({ props }) => (
    <CodeBlock code={props.code ?? ""} lang={props.language} className="ge-codeblock overflow-x-auto p-2.5" />
  ),
});

export const godeyeLibrary = createLibrary({
  id: "godeye@1",
  root: "Stack",
  components: [Stack, Card, Text, Stats, Chart, Progress, Table, Callout, Code],
});

/** One ```openui block; while the answer streams in, it is drawn as far as it is written. */
export default function OpenUiBlock({ code, streaming }: { code: string; streaming?: boolean }) {
  return (
    <div className="my-2 space-y-3">
      <Renderer response={code} library={godeyeLibrary} isStreaming={streaming} />
    </div>
  );
}
