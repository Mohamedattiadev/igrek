import { RotateCcw, TriangleAlert } from "lucide-react";
import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui";

/**
 * The last net under the whole app: a page that throws while it draws would otherwise leave an empty
 * white window with nothing to report. The message is what the user sends us.
 */
export class RootBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  override state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    return this.state.error ? <Crashed error={this.state.error} /> : this.props.children;
  }
}

function Crashed({ error }: { error: Error }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center bg-bg-subtle p-4">
      <div role="alert" className="w-full max-w-md space-y-3 rounded-xl border border-border bg-bg p-6 shadow-ui">
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          <TriangleAlert size={18} className="text-warning" aria-hidden="true" />
          {t("crash.title")}
        </p>
        <p className="text-[13px] leading-relaxed text-fg-muted">{t("crash.body")}</p>
        <pre className="max-h-40 overflow-auto rounded-ui bg-bg-subtle p-2 font-mono text-[11.5px] whitespace-pre-wrap">
          {error.message}
        </pre>
        <Button variant="primary" icon={RotateCcw} onClick={() => window.location.reload()}>
          {t("crash.reload")}
        </Button>
      </div>
    </div>
  );
}
