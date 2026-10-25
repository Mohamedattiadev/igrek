import { Bug, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { Button, CopyButton, Dialog } from "./ui";

const ISSUES = "https://github.com/Mohamedattiadev/igrek/issues/new";
/** GitHub refuses very long addresses; the end of a long log is what matters. */
const MAX_BODY = 6000;

/**
 * "Report a problem": the report Igrek prepares (version, system, its last log lines with private details
 * taken out) is shown in full and can be changed; only "Open on GitHub" sends it, as a public issue the
 * user files themselves. Igrek itself sends nothing.
 */
export function ReportProblem({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!open) return;
    let current = true;
    api
      .report()
      .then((r) => current && setBody(r.text))
      .catch((err: Error) => current && setError(err.message));
    return () => {
      current = false;
    };
  }, [open]);
  const url = `${ISSUES}?title=${encodeURIComponent(title || t("report.defaultTitle"))}&body=${encodeURIComponent(body.slice(-MAX_BODY))}`;
  return (
    <Dialog open={open} onClose={onClose} label={t("report.title")} wide>
      <div className="space-y-3 p-5 text-[13px]">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Bug size={16} className="text-accent" aria-hidden="true" />
          {t("report.title")}
        </h2>
        <p className="text-fg-muted">{t("report.body")}</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("report.titlePlaceholder")}
          aria-label={t("report.titlePlaceholder")}
          className="h-8 w-full rounded-ui border border-border bg-bg px-2"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          aria-label={t("report.title")}
          className="w-full rounded-ui border border-border bg-bg p-2 font-mono text-[12px]"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <p className="text-[12px] text-fg-subtle">{t("report.public")}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <CopyButton text={body} />
          <a href={url} target="_blank" rel="noreferrer">
            <Button variant="primary" icon={ExternalLink}>
              {t("report.open")}
            </Button>
          </a>
        </div>
      </div>
    </Dialog>
  );
}
