import type { TimelineItem } from "@igrek/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
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
  const { pathname } = useLocation();
  const [view, setView] = useState<OrgView>();
  const [hubUrl, setHubUrl] = useState<string>();
  const [sfu, setSfu] = useState(false);
  useEffect(() => {
    let current = true;
    void request<{ url?: string }>("/api/org/sfu")
      .then((r) => current && setSfu(!!r.url))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
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
  const [params] = useSearchParams();
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
      ...(sfu ? { sfu: (room: string) => post<{ url: string; token: string }>("/api/org/sfu-token", { room }) } : {}),
      meetingLink: (id: string) => `${location.origin}/meetings?meet=${id}&join=1`,
      hubUrl,
      transcribe: (audio) => transcribe(audio, i18n.language.split("-")[0] ?? "en"),
      ask: (question) => post<TimelineItem[]>("/api/org/ask", { question }),
      testers: async (key, url, task) => {
        const id = await projectId(key);
        const profiles = (await server.testerProfiles()).slice(0, 3).map((p) => p.id);
        const run = await server.startTesterRun({ url, task, profileIds: profiles, ...(id ? { projectId: id } : {}) });
        void navigate(`/test-runs/${run.id}`);
      },
      addDecision: (key, text) =>
        projectId(key).then((id) => (id ? server.addMemory(id, "decision", text) : undefined)),
    }),
    [view, reload, navigate, hubUrl, sfu],
  );
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <OrgPage
        api={api}
        // Meetings have their own place in the strip (a user could not find them as a tab here).
        tab={params.get("tab") ?? undefined}
        only={pathname === "/meetings" ? "meetings" : undefined}
        meeting={params.get("meet") ?? undefined}
        join={params.get("join") === "1"}
        onTab={(tab) => void navigate(tab === "meetings" ? "/meetings" : `/org?tab=${tab}`, { replace: true })}
      />
    </div>
  );
}
