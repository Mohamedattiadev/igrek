import { type ComponentProps, lazy, Suspense } from "react";
import type { Markdown as Eager } from "./Markdown";

const Markdown = lazy(() => import("./Markdown").then((m) => ({ default: m.Markdown })));

/**
 * Markdown for parts of the first screen (the helper, the day recap): the renderer loads only
 * when there is text to show (plan.md 15.4). Until then the raw text holds its place.
 */
export function LazyMarkdown(props: ComponentProps<typeof Eager>) {
  return (
    <Suspense fallback={<div className={`${props.className ?? ""} whitespace-pre-wrap opacity-70`}>{props.text}</div>}>
      <Markdown {...props} />
    </Suspense>
  );
}
