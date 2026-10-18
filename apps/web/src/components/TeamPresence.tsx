import type { Presence } from "@igrek/core";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useServerEvent } from "../lib/live";

function usePresence(projectId?: string): Presence[] {
  const [list, setList] = useState<Presence[]>([]);
  const load = () => {
    api
      .teamPresence(projectId)
      .then(setList)
      .catch(() => setList([]));
  };
  useEffect(load, [projectId]);
  useServerEvent("presence", load);
  return list;
}

/** "Kerim is working here" (green dot), with a warning when you're both in the same files. */
export function TeamPresence({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const presence = usePresence(projectId);
  if (!presence.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presence.map((p) => (
        <span
          key={p.userId}
          title={[p.title, ...p.files.slice(-5)].filter(Boolean).join("\n")}
          className={
            p.overlap
              ? "inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] text-warning"
              : "inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] text-success"
          }
        >
          {p.overlap ? <AlertTriangle size={11} /> : <span className="size-1.5 rounded-full bg-success" />}
          {p.overlap
            ? t("team.overlap", { name: p.name, files: p.overlap.slice(0, 2).join(", ") })
            : t("team.workingHere", { name: p.name })}
        </span>
      ))}
    </div>
  );
}
