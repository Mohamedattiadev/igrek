import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Segmented } from "../../components/ui";
import { BoardsTab } from "./Boards";
import { WikiTab } from "./Wiki";

/** Wiki pages and whiteboards of a project (plan.md 12). */
export function DocsTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "boards" || params.has("board") ? "boards" : "wiki";
  return (
    <div className="space-y-4">
      {!params.has("board") && (
        <Segmented
          label={t("project.docs")}
          value={view}
          onChange={(v) => setParams({ tab: "docs", view: v })}
          options={[
            { value: "wiki", label: t("wiki.tab") },
            { value: "boards", label: t("boards.list") },
          ]}
        />
      )}
      {view === "wiki" ? <WikiTab projectId={projectId} /> : <BoardsTab projectId={projectId} />}
    </div>
  );
}
