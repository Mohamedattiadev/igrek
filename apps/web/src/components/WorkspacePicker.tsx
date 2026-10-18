import type { ServerInfo } from "@igrek/core";
import { Check, ChevronDown, Laptop, Layers, Server, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { useServerEvent } from "../lib/live";

export type Workspace = "all" | "local" | "team";
const KEY = "igrek.workspace";
const target = new EventTarget();

function currentWorkspace(): Workspace {
  try {
    const v = localStorage.getItem(KEY);
    return v === "local" || v === "team" ? v : "all";
  } catch {
    return "all";
  }
}

/** The projects list follows the picked workspace. */
export function useWorkspace(): Workspace {
  const [ws, setWs] = useState(currentWorkspace);
  useEffect(() => {
    const on = () => setWs(currentWorkspace());
    target.addEventListener("change", on);
    return () => target.removeEventListener("change", on);
  }, []);
  return ws;
}

function choose(ws: Workspace): void {
  try {
    localStorage.setItem(KEY, ws);
  } catch {
    // private window: the choice just won't stick
  }
  target.dispatchEvent(new Event("change"));
}

/**
 * Top-left workspace picker (plan.md 1.2b): this computer, the team, or a
 * server. Each keeps its own projects; picking one never mixes them.
 */
export function WorkspacePicker() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const [open, setOpen] = useState(false);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [team, setTeam] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const load = () => {
    api
      .servers()
      .then(setServers)
      .catch(() => undefined);
    api
      .team()
      .then((s) => setTeam(s.configured))
      .catch(() => undefined);
  };
  useEffect(load, []);
  useServerEvent("servers-changed", load);
  useServerEvent("team-changed", load);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const Icon = ws === "team" ? Users : ws === "local" ? Laptop : Layers;
  const item = (key: Workspace, ItemIcon: typeof Laptop, label: string, hint: string) => (
    <button
      type="button"
      onClick={() => {
        choose(key);
        setOpen(false);
        void navigate("/");
      }}
      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-start hover:bg-bg-hover"
    >
      <ItemIcon size={14} className="mt-0.5 text-fg-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px]">{label}</span>
        <span className="block text-[11px] text-fg-subtle">{hint}</span>
      </span>
      {ws === key && <Check size={13} className="mt-0.5 text-accent" aria-hidden="true" />}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        data-tip={t("workspace.pickerTip")}
        className="flex h-7 items-center gap-2 whitespace-nowrap rounded-ui px-2 text-[13px] font-medium hover:bg-bg-hover"
      >
        <Icon size={15} strokeWidth={1.75} className="text-fg-muted" aria-hidden="true" />
        {t(`workspace.${ws}`)}
        <ChevronDown size={13} className="text-fg-subtle" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute start-0 top-full z-30 mt-1 w-72 rounded-ui border border-border bg-bg p-1 shadow-ui">
          {item("all", Layers, t("workspace.all"), t("workspace.allHint"))}
          {item("local", Laptop, t("workspace.local"), t("workspace.localHint"))}
          {team && item("team", Users, t("workspace.team"), t("workspace.teamHint"))}
          {servers.length > 0 && (
            <>
              <p className="px-2 pt-2 pb-1 text-[10.5px] font-medium text-fg-subtle uppercase">
                {t("workspace.servers")}
              </p>
              {servers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void navigate(`/servers/${s.id}`);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-[13px] hover:bg-bg-hover",
                  )}
                >
                  <Server size={14} className="text-fg-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      s.health?.ok ? "bg-success" : s.health ? "bg-danger" : "bg-fg-subtle",
                    )}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
