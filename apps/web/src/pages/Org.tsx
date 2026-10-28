import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { OrgApi, OrgView } from "../components/org/api";
import { OrgPage } from "../components/org/OrgPage";
import { request } from "../lib/api";
import { useCoalesced, useServerEvent } from "../lib/live";

const post = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

/**
 * The company in Igrek (plan.md 20): the server folds the encrypted company stream and the hub's
 * teams; this page reads them and writes back through it. The hub's web page shows the same page.
 */
export function Org() {
  const [view, setView] = useState<OrgView>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const load = useCallback(() => {
    let current = true;
    void request<OrgView & { me: OrgView["me"] | null }>("/api/org")
      .then((v) => current && setView(v.me ? (v as OrgView) : undefined))
      .catch(() => current && setView(undefined));
    return () => {
      current = false;
    };
  }, []);
  useEffect(load, [load]);
  const reload = useCoalesced(load, 300);
  useServerEvent("org-changed", reload);
  useServerEvent("team-changed", reload);
  const api: OrgApi = useMemo(
    () => ({
      view,
      act: (kind, value) => post("/api/org/act", { kind, value }).then(reload),
      post: (input) => post("/api/org/post", input).then(reload),
      teams: (method, path, body) =>
        request(`/api/org/hub/${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) }).then(reload),
      summarize: (facts, ask) => post<{ answer: string }>("/api/org/summary", { facts, ask }).then((r) => r.answer),
      openProject: (key) => {
        void request<{ projectId: string; key: string }[]>("/api/team/projects")
          .then((list) => {
            const id = list.find((p) => p.key === key)?.projectId;
            if (id) void navigate(`/p/${id}`);
          })
          .catch(() => undefined);
      },
    }),
    [view, reload, navigate],
  );
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <OrgPage api={api} tab={params.get("tab") ?? undefined} onTab={(tab) => setParams({ tab }, { replace: true })} />
    </div>
  );
}
