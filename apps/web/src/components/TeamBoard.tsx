import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { request } from "../lib/api";
import { cn } from "../lib/cn";
import { Segmented } from "./ui";

interface Row {
  id: string;
  name: string;
  me: boolean;
  commits: number;
  sessions: number;
  comments: number;
  memory: number;
  projects: number;
}

/** Team board (plan.md 13.3): who worked on what in the shared projects. For visibility, not blame. */
export function TeamBoard() {
  const { t } = useTranslation();
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [rows, setRows] = useState<Row[]>();
  useEffect(() => {
    request<Row[]>(`/api/team/board?days=${days}`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [days]);
  const max = Math.max(1, ...(rows ?? []).map((r) => r.commits + r.sessions));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-fg-muted">{t("teamBoard.note")}</p>
        <Segmented
          label={t("teamBoard.range")}
          value={days}
          onChange={setDays}
          options={[
            { value: "7", label: t("teamBoard.d7") },
            { value: "30", label: t("teamBoard.d30") },
            { value: "90", label: t("teamBoard.d90") },
          ]}
        />
      </div>
      {rows && !rows.length ? (
        <p className="text-xs text-fg-subtle">{t("teamBoard.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead>
              <tr className="text-xs text-fg-muted">
                <th className="py-1 text-start font-normal">{t("teamBoard.person")}</th>
                <th className="py-1 text-end font-normal">{t("teamBoard.commits")}</th>
                <th className="py-1 text-end font-normal">{t("teamBoard.sessions")}</th>
                <th className="py-1 text-end font-normal">{t("teamBoard.comments")}</th>
                <th className="py-1 text-end font-normal">{t("teamBoard.memory")}</th>
                <th className="py-1 text-end font-normal">{t("teamBoard.projects")}</th>
                <th className="w-32" />
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className={cn("py-1.5", r.me && "font-medium")}>
                    {r.name}
                    {r.me && <span className="ms-1 text-xs text-fg-subtle">({t("team.you")})</span>}
                  </td>
                  <td className="text-end">{r.commits}</td>
                  <td className="text-end">{r.sessions}</td>
                  <td className="text-end">{r.comments}</td>
                  <td className="text-end">{r.memory}</td>
                  <td className="text-end">{r.projects}</td>
                  <td className="ps-3">
                    <div
                      className="h-1.5 rounded-full bg-accent/60"
                      style={{ width: `${((r.commits + r.sessions) / max) * 100}%` }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
