import { Lightbulb } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { actions, contextFromPath } from "../lib/actions";
import { api } from "../lib/api";
import { MicButton } from "./MicButton";
import { Button, Dialog } from "./ui";

/** Ctrl+I from anywhere: drop an idea in one line and get back to work (plan.md 2.6c). */
export function IdeaCapture({ onSaved }: { onSaved: (message: string) => void }) {
  const { t } = useTranslation();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "i") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    const off = actions.on("capture-idea", () => setOpen(true));
    return () => {
      window.removeEventListener("keydown", onKey);
      off();
    };
  }, []);

  const save = async () => {
    if (!text.trim()) return;
    await api.addIdea(text.trim(), contextFromPath(location.pathname).projectId);
    setText("");
    setOpen(false);
    onSaved(t("ideas.saved"));
  };

  return (
    <Dialog open={open} onClose={() => setOpen(false)} label={t("ideas.capture")}>
      <div className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Lightbulb size={16} className="text-warning" />
          {t("ideas.capture")}
        </h2>
        <div className="flex items-center gap-1">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder={t("ideas.capturePlaceholder")}
            className="h-10 min-w-0 flex-1 rounded-ui border border-border bg-bg px-3 text-[14px] outline-none focus:border-accent"
          />
          <MicButton onText={(spoken) => setText((v) => (v ? `${v} ${spoken}` : spoken))} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("memory.cancel")}
          </Button>
          <Button variant="primary" onClick={save} disabled={!text.trim()}>
            {t("project.save")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
