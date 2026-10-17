import { useEffect, useRef } from "react";
import { applyMonacoTheme, languageFor, monaco } from "../lib/monaco";

/** Side-by-side diff: last commit on the left, the file now on the right. */
export default function DiffView({ path, original, modified }: { path: string; original: string; modified: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    applyMonacoTheme();
    const language = languageFor(path);
    const editor = monaco.editor.createDiffEditor(host.current, {
      automaticLayout: true,
      readOnly: true,
      renderSideBySide: true,
      fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, Menlo, monospace',
      fontSize: 12,
      minimap: { enabled: false },
    });
    const left = monaco.editor.createModel(original, language);
    const right = monaco.editor.createModel(modified, language);
    editor.setModel({ original: left, modified: right });
    return () => {
      editor.dispose();
      left.dispose();
      right.dispose();
    };
  }, [path, original, modified]);
  return <div ref={host} className="h-full w-full" />;
}
