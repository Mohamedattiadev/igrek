import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { CallTransport } from "../components/meet/call";
import type { OrgApi, OrgView } from "../components/org/api";
import { OrgPage } from "../components/org/OrgPage";
import { request, api as server } from "../lib/api";
import i18n from "../lib/i18n";
import { listenServer, useCoalesced, useServerEvent } from "../lib/live";
import { transcribe } from "../lib/speech";

/** A call's messages: out through this computer's connection to the hub, in as server events. */
const callTransport: CallTransport = {
  send: (msg) => void request("/api/org/call", { method: "POST", body: JSON.stringify(msg) }).catch(() => undefined),
  subscribe: (fn) => listenServer("call", (m) => fn(m)),
};

/** The project's id on this computer for its hub id. */
const projectId = (key: string) =>
  request<{ projectId: string; key: string }[]>("/api/team/projects").then(
    (list) => list.find((p) => p.key === key)?.projectId,
  );

const post = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

/**
 * The company in Igrek (plan.md 20): the server folds the encrypted company stream and the hub's
 * teams; this page reads them and writes back through it. The hub's web page shows the same page.
 */
export function Org() {
  const [view, setView] = useState<OrgView>();
  const [hubUrl, setHubUrl] = useState<string>();
  useEffect(() => {
    let current = true;
    void server
      .team()
      .then((s) => current && setHubUrl(s.hub))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
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
        void projectId(key)
          .then((id) => id && navigate(`/p/${id}`))
          .catch(() => undefined);
      },
      call: callTransport,
      guestLink: (room) => post<{ token: string }>("/api/org/guest-link", { room }).then((r) => r.token),
      hubUrl,
      transcribe: (audio) => transcribe(audio, i18n.language.split("-")[0] ?? "en"),
      addDecision: (key, text) =>
        projectId(key).then((id) => (id ? server.addMemory(id, "decision", text) : undefined)),
    }),
    [view, reload, navigate, hubUrl],
  );
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <OrgPage
        api={api}
        tab={params.get("tab") ?? undefined}
        meeting={params.get("meet") ?? undefined}
        onTab={(tab) => setParams({ tab }, { replace: true })}
      />
    </div>
  );
}
