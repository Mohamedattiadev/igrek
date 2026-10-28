import type { UiElement } from "@igrek/core";
import { MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { saveUiNote } from "./UiNotesPanel";
import { Button, Dialog, field } from "./ui";

/** A short path to an element: up to three steps of tag, id or the first two classes. */
function selectorOf(el: Element): string {
  const steps: string[] = [];
  for (let node: Element | null = el; node && steps.length < 3 && node !== document.body; node = node.parentElement) {
    if (node.id) {
      steps.unshift(`#${node.id}`);
      break;
    }
    const classes = [...node.classList].filter((c) => /^[a-z][\w-]*$/.test(c)).slice(0, 2);
    steps.unshift(`${node.tagName.toLowerCase()}${classes.map((c) => `.${c}`).join("")}`);
  }
  return steps.join(" > ");
}

/** What the user pointed at: its words, or its label, so the note says which one. */
function describe(el: Element, path: string): UiElement {
  const label = el.getAttribute("aria-label") ?? el.getAttribute("title") ?? (el as HTMLElement).innerText ?? "";
  return {
    url: `igrek:${path}`,
    selector: selectorOf(el),
    tag: el.tagName.toLowerCase(),
    ...(label.trim() ? { text: label.trim().replace(/\s+/g, " ").slice(0, 160) } : {}),
  };
}

/**
 * A note on Igrek's own screens (plan.md 19.5): press the button, point at what you do not like,
 * write why. It goes to the notes of the project you pick (the one Igrek is built in), where it is
 * sent to a chat and fixed like a note on a preview.
 */
export function ScreenNote() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [picking, setPicking] = useState(false);
  const [element, setElement] = useState<UiElement>();
  const [text, setText] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!picking) return;
    let hovered: HTMLElement | undefined;
    const over = (e: MouseEvent) => {
      if (hovered) hovered.style.outline = "";
      hovered = e.target as HTMLElement;
      hovered.style.outline = "2px solid var(--color-accent, #3b82f6)";
    };
    // The click that picks does nothing else: no link opens, no button runs.
    const click = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (hovered) hovered.style.outline = "";
      setElement(describe(e.target as Element, pathname));
      setPicking(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPicking(false);
    document.addEventListener("mouseover", over, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", onKey);
    return () => {
      if (hovered) hovered.style.outline = "";
      document.removeEventListener("mouseover", over, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [picking, pathname]);
  useEffect(() => {
    if (!element) return;
    let current = true;
    void api
      .projects()
      .then((list) => {
        if (!current) return;
        setProjects(list);
        // The project Igrek itself is built in, when it is one of them.
        setProjectId(
          (id) => id || (list.find((p) => /igrek|project_manager/i.test(`${p.name} ${p.path}`)) ?? list[0])?.id || "",
        );
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [element]);
  const close = () => {
    setElement(undefined);
    setText("");
    setSaved(false);
  };
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon={MessageSquareText}
        aria-pressed={picking}
        aria-label={t("uiNotes.screen")}
        data-tip={t(picking ? "uiNotes.screenPicking" : "uiNotes.screen")}
        className={cn(picking && "bg-accent-soft text-accent")}
        onClick={(e) => {
          e.stopPropagation();
          setPicking(!picking);
        }}
      />
      <Dialog open={!!element} onClose={close} label={t("uiNotes.screen")}>
        <form
          className="space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (element && projectId && text.trim())
              void saveUiNote(projectId, element, text.trim()).then(() => setSaved(true));
          }}
        >
          <h2 className="text-[15px] font-semibold">{t("uiNotes.screen")}</h2>
          <p className="rounded-ui bg-bg-muted px-3 py-2 font-mono text-[12px]">
            {element?.url.slice(6)} · &lt;{element?.tag}&gt; {element?.text ?? element?.selector}
          </p>
          {saved ? (
            <p className="text-[13px] text-success">{t("uiNotes.saved")}</p>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder={t("uiNotes.placeholder")}
                aria-label={t("uiNotes.placeholder")}
                className={cn(field, "h-auto w-full py-1.5")}
              />
              <label className="block space-y-1 text-[12.5px]">
                <span className="font-medium">{t("uiNotes.project")}</span>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className={cn(field, "w-full")}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              {t(saved ? "uiNotes.done" : "uiNotes.cancel")}
            </Button>
            {!saved && (
              <Button type="submit" variant="primary" disabled={!text.trim() || !projectId}>
                {t("uiNotes.save")}
              </Button>
            )}
          </div>
        </form>
      </Dialog>
    </>
  );
}
