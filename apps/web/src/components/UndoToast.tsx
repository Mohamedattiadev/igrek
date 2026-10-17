import { Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { undoDelete, usePendingDeletes } from "../lib/undo";

/** "Deleted · Undo" for each delete that is still waiting. */
export function UndoToast() {
  const { t } = useTranslation();
  const { list } = usePendingDeletes();
  if (!list.length) return null;
  return (
    <div className="fixed bottom-10 start-1/2 z-50 flex -translate-x-1/2 flex-col gap-2 rtl:translate-x-1/2">
      {list.slice(-3).map((p) => (
        <div
          key={p.id}
          role="status"
          className="flex items-center gap-3 rounded-ui border border-border bg-bg px-3 py-2 text-[13px] shadow-ui"
        >
          <span className="max-w-72 truncate">{t("undo.deleted", { what: p.label })}</span>
          <button
            type="button"
            onClick={() => undoDelete(p.id)}
            className="flex items-center gap-1 font-medium text-accent hover:underline"
          >
            <Undo2 size={13} aria-hidden="true" /> {t("undo.undo")}
          </button>
        </div>
      ))}
    </div>
  );
}
