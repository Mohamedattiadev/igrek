import { type CALLOUT_KINDS, LIBRARY_ID, ROOT, SCHEMAS } from "@igrek/genui";
import { type ActionEvent, createLibrary, defineComponent, Renderer, useTriggerAction } from "@openuidev/react-lang";
import { useTranslation } from "react-i18next";
import { actions } from "../lib/actions";
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

const Stack = defineComponent({
  name: "Stack",
  ...SCHEMAS.Stack,
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
  ...SCHEMAS.Card,
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
  ...SCHEMAS.Text,
  component: ({ props }) => <Markdown text={props.markdown ?? ""} />,
});

const Stats = defineComponent({
  name: "Stats",
  ...SCHEMAS.Stats,
  component: ({ props }) => <RichBlock lang="stats" code={JSON.stringify(props.items ?? [])} />,
});

const Chart = defineComponent({
  name: "Chart",
  ...SCHEMAS.Chart,
  component: ({ props }) => <RichBlock lang="chart" code={JSON.stringify(props)} />,
});

const Progress = defineComponent({
  name: "Progress",
  ...SCHEMAS.Progress,
  component: ({ props }) => <RichBlock lang="progress" code={JSON.stringify(props.items ?? [])} />,
});

const Table = defineComponent({
  name: "Table",
  ...SCHEMAS.Table,
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

function CalloutBox({ kind, text }: { kind: (typeof CALLOUT_KINDS)[number]; text: string }) {
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
  ...SCHEMAS.Callout,
  component: ({ props }) => <CalloutBox kind={props.kind ?? "note"} text={props.text ?? ""} />,
});

function ActionButton({ label, action }: { label: string; action: unknown }) {
  const trigger = useTriggerAction();
  return (
    <button
      type="button"
      onClick={() => void trigger(label, undefined, action as Parameters<typeof trigger>[2])}
      className="rounded-ui border border-border bg-bg px-3 py-1.5 text-[13px] hover:border-accent hover:text-accent-hover"
    >
      {label}
    </button>
  );
}

const Button = defineComponent({
  name: "Button",
  ...SCHEMAS.Button,
  component: ({ props }) => <ActionButton label={props.label ?? ""} action={props.action} />,
});

/** What a button asked for: a follow-up goes to the open chat, a web page opens in a new tab (http and https only). */
function onAction(event: ActionEvent): void {
  if (event.type === "open_url") {
    const url = String(event.params.url ?? "");
    if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  if (event.type === "continue_conversation")
    actions.sendToChat(String(event.params.message ?? event.humanFriendlyMessage ?? ""));
}

const Code = defineComponent({
  name: "Code",
  ...SCHEMAS.Code,
  component: ({ props }) => (
    <CodeBlock code={props.code ?? ""} lang={props.language} className="ge-codeblock overflow-x-auto p-2.5" />
  ),
});

const godeyeLibrary = createLibrary({
  id: LIBRARY_ID,
  root: ROOT,
  components: [Stack, Card, Text, Stats, Chart, Progress, Table, Callout, Button, Code],
});

/** One ```openui block; while the answer streams in, it is drawn as far as it is written. */
export default function OpenUiBlock({ code, streaming }: { code: string; streaming?: boolean }) {
  return (
    <div className="my-2 space-y-3">
      <Renderer response={code} library={godeyeLibrary} isStreaming={streaming} onAction={onAction} />
    </div>
  );
}
