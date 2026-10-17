import { initVimMode } from "monaco-vim";
import { useEffect, useRef } from "react";
import { actions } from "../lib/actions";
import i18n from "../lib/i18n";
import { applyKeymap, type EditorKeymap } from "../lib/keymaps";
import { applyMonacoTheme, languageFor, monaco } from "../lib/monaco";

export interface CodeEditorProps {
  path: string;
  value: string;
  onChange?: (value: string) => void;
  onSave?: () => void;
  keymap?: EditorKeymap;
  readOnly?: boolean;
  /** Line to reveal on open (from search results). */
  line?: number;
  /** Quiet notes at the end of lines ("who wrote this"), with more on hover. */
  annotations?: { line: number; text: string; hover?: string }[];
}

/**
 * VS Code's editor (Monaco) with optional Vim mode (plan.md 2.3). One model per
 * file path, so undo history survives switching tabs.
 */
export default function CodeEditor({
  path,
  value,
  onChange,
  onSave,
  keymap = "vscode",
  readOnly,
  line,
  annotations,
}: CodeEditorProps) {
  const vim = keymap === "vim";
  const host = useRef<HTMLDivElement>(null);
  const vimBar = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | undefined>(undefined);
  const handlers = useRef({ onChange, onSave });
  handlers.current = { onChange, onSave };

  useEffect(() => {
    if (!host.current) return;
    applyMonacoTheme();
    const editor = monaco.editor.create(host.current, {
      automaticLayout: true,
      fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
      fontSize: 13,
      lineHeight: 20,
      minimap: { enabled: true, renderCharacters: false },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      renderLineHighlight: "line",
      padding: { top: 8 },
      tabSize: 2,
    });
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => handlers.current.onSave?.());
    // Right-click → "Ask AI about this" sends the selection (or the current line) to the quick question panel.
    editor.addAction({
      id: "godeye.ask",
      label: i18n.t("preview.askSelection"),
      contextMenuGroupId: "navigation",
      contextMenuOrder: 0,
      run: (ed) => {
        const model = ed.getModel();
        const selection = ed.getSelection();
        if (!model || !selection) return;
        const line = selection.startLineNumber;
        const range = selection.isEmpty() ? new monaco.Range(line, 1, line, model.getLineMaxColumn(line)) : selection;
        const name = `${model.uri.path.split("/").pop()}:${range.startLineNumber}-${range.endLineNumber}`;
        actions.quickAsk({
          question: i18n.t("preview.askSelectionQ"),
          attachment: { name, text: model.getValueInRange(range) },
        });
      },
    });
    // Right-click (or Ctrl+Shift+Enter) → "Write a prompt for this": the selection becomes context for the enhancer.
    editor.addAction({
      id: "godeye.enhance",
      label: i18n.t("enhance.forSelection"),
      contextMenuGroupId: "navigation",
      contextMenuOrder: 1,
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      run: (ed) => {
        const model = ed.getModel();
        const selection = ed.getSelection();
        if (!model || !selection) return;
        actions.enhanceCode({
          file: model.uri.path,
          selection: selection.isEmpty() ? undefined : model.getValueInRange(selection),
          startLine: selection.startLineNumber,
          endLine: selection.endLineNumber,
        });
      },
    });
    const themeWatch = new MutationObserver(applyMonacoTheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      themeWatch.disconnect();
      editor.dispose();
    };
  }, []);

  // Switch the file shown; reuse the model so each file keeps its own undo stack.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const uri = monaco.Uri.file(path);
    let model = monaco.editor.getModel(uri);
    if (!model) model = monaco.editor.createModel(value, languageFor(path), uri);
    else if (model.getValue() !== value && !model.isAttachedToEditor()) model.setValue(value);
    editor.setModel(model);
    const sub = model.onDidChangeContent(() => handlers.current.onChange?.(model.getValue()));
    if (line) {
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
    }
    editor.focus();
    return () => sub.dispose();
  }, [path, value, line]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly: !!readOnly });
  }, [readOnly]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: redraw when the file or the notes change
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !annotations?.length) return;
    const collection = editor.createDecorationsCollection(
      annotations.map((a) => ({
        range: new monaco.Range(a.line, 1, a.line, 1),
        options: {
          isWholeLine: true,
          after: { content: `    ${a.text}`, inlineClassName: "godeye-annotation" },
          hoverMessage: a.hover ? { value: a.hover } : undefined,
        },
      })),
    );
    return () => collection.clear();
  }, [annotations, path]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || keymap === "vscode" || keymap === "vim") return;
    return applyKeymap(monaco, editor, keymap, () => handlers.current.onSave?.());
  }, [keymap]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!vim || !editor || !vimBar.current) return;
    const mode = initVimMode(editor, vimBar.current);
    return () => mode.dispose();
  }, [vim]);

  return (
    <div className="flex h-full flex-col">
      <div ref={host} className="min-h-0 flex-1" />
      {vim && (
        <div
          ref={vimBar}
          className="flex h-6 shrink-0 items-center border-t border-border bg-bg-subtle px-3 font-mono text-[11px] text-accent"
        />
      )}
    </div>
  );
}
