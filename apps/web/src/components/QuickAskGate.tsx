import { lazy, Suspense, useEffect, useState } from "react";
import { actions, type QuickAskRequest } from "../lib/actions";
import { takeQuickAskFromStart } from "../lib/desktop";

// The panel (and the prompt enhancer it brings) is downloaded only when first asked for, so the
// first screen stays light (plan.md 19.10); from then on it listens for itself.
const QuickAsk = lazy(() => import("./QuickAsk").then((m) => ({ default: m.QuickAsk })));

/** Waits for Ctrl+Space, the desktop's shortcut or a "quick ask" from a page, then loads the panel. */
export function QuickAskGate() {
  const [first, setFirst] = useState<QuickAskRequest | null>(() => (takeQuickAskFromStart() ? {} : null));
  useEffect(() => {
    if (first !== null) return;
    const onKey = (event: KeyboardEvent) => {
      // Inside the code editor Ctrl+Space stays autocomplete; Ctrl+Shift+Space works everywhere.
      const inEditor = event.target instanceof Element && !!event.target.closest(".monaco-editor");
      if (event.ctrlKey && event.code === "Space" && (event.shiftKey || !inEditor)) {
        event.preventDefault();
        setFirst({});
      }
    };
    const fromDesktop = () => setFirst({});
    window.addEventListener("keydown", onKey);
    window.addEventListener("igrek:quick-ask", fromDesktop);
    const off = actions.on("quick-ask", (request) => setFirst(request));
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("igrek:quick-ask", fromDesktop);
      off();
    };
  }, [first]);
  if (first === null) return null;
  return (
    <Suspense fallback={null}>
      <QuickAsk start={first} />
    </Suspense>
  );
}
