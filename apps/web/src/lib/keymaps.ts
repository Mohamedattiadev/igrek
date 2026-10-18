import type * as Monaco from "monaco-editor";

export type EditorKeymap = "vscode" | "jetbrains" | "vim" | "emacs";

type Editor = Monaco.editor.IStandaloneCodeEditor;

/** Runs a built-in editor action by id ("editor.action.copyLinesDownAction"). */
const action = (editor: Editor, id: string) => () => void editor.getAction(id)?.run();
const trigger = (editor: Editor, id: string) => () => editor.trigger("keymap", id, null);

/**
 * Key bindings on top of Monaco's own (which already are VS Code's).
 * Vim mode is handled by monaco-vim; these cover JetBrains and Emacs.
 */
export function applyKeymap(
  monaco: typeof Monaco,
  editor: Editor,
  keymap: EditorKeymap,
  onSave?: () => void,
): () => void {
  const { KeyMod: M, KeyCode: K } = monaco;
  const bindings: [number, () => void][] = [];
  if (keymap === "jetbrains") {
    bindings.push(
      [M.CtrlCmd | K.KeyD, action(editor, "editor.action.copyLinesDownAction")],
      [M.CtrlCmd | K.KeyY, action(editor, "editor.action.deleteLines")],
      [M.CtrlCmd | M.Alt | K.KeyL, action(editor, "editor.action.formatDocument")],
      [M.Shift | K.F6, action(editor, "editor.action.rename")],
      [M.CtrlCmd | K.KeyB, action(editor, "editor.action.revealDefinition")],
      [M.CtrlCmd | M.Shift | K.UpArrow, action(editor, "editor.action.moveLinesUpAction")],
      [M.CtrlCmd | M.Shift | K.DownArrow, action(editor, "editor.action.moveLinesDownAction")],
      [M.CtrlCmd | K.KeyW, action(editor, "editor.action.smartSelect.expand")],
      [M.CtrlCmd | M.Shift | K.KeyW, action(editor, "editor.action.smartSelect.shrink")],
      [M.Alt | K.KeyJ, action(editor, "editor.action.addSelectionToNextFindMatch")],
      [M.CtrlCmd | K.KeyG, action(editor, "editor.action.gotoLine")],
      [M.CtrlCmd | K.KeyR, action(editor, "editor.action.startFindReplaceAction")],
      [M.CtrlCmd | M.Shift | K.KeyU, action(editor, "editor.action.transformToUppercase")],
    );
  }
  if (keymap === "emacs") {
    // WinCtrl is the real Control key on every platform (Cmd stays free on macOS).
    const C = M.WinCtrl;
    bindings.push(
      [C | K.KeyA, trigger(editor, "cursorHome")],
      [C | K.KeyE, trigger(editor, "cursorEnd")],
      [C | K.KeyF, trigger(editor, "cursorRight")],
      [C | K.KeyB, trigger(editor, "cursorLeft")],
      [C | K.KeyN, trigger(editor, "cursorDown")],
      [C | K.KeyP, trigger(editor, "cursorUp")],
      [M.Alt | K.KeyF, trigger(editor, "cursorWordEndRight")],
      [M.Alt | K.KeyB, trigger(editor, "cursorWordStartLeft")],
      [C | K.KeyD, trigger(editor, "deleteRight")],
      [M.Alt | K.KeyD, trigger(editor, "deleteWordRight")],
      [C | K.KeyK, action(editor, "deleteAllRight")],
      [C | K.KeyW, () => void editor.trigger("keymap", "editor.action.clipboardCutAction", null)],
      [M.Alt | K.KeyW, () => void editor.trigger("keymap", "editor.action.clipboardCopyAction", null)],
      [C | K.KeyY, () => void editor.trigger("keymap", "editor.action.clipboardPasteAction", null)],
      [C | K.Slash, trigger(editor, "undo")],
      [C | K.KeyS, action(editor, "actions.find")],
      [
        C | K.KeyG,
        () => editor.setSelection(editor.getSelection()?.collapseToStart() ?? new monaco.Selection(1, 1, 1, 1)),
      ],
      [M.Alt | M.Shift | K.Comma, trigger(editor, "cursorTop")],
      [M.Alt | M.Shift | K.Period, trigger(editor, "cursorBottom")],
      [M.chord(C | K.KeyX, C | K.KeyS), () => onSave?.()],
      [M.chord(C | K.KeyX, K.KeyH), action(editor, "editor.action.selectAll")],
    );
  }
  // addCommand has no dispose; a command bound to a never-matching context is how we "remove" it.
  const context = editor.createContextKey<boolean>(`igrekKeymap_${keymap}`, true);
  for (const [keys, run] of bindings) editor.addCommand(keys, run, `igrekKeymap_${keymap}`);
  return () => context.set(false);
}
